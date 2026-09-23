async function gpt_image_2_5(params, userSettings, authorizedResources) {
  const prompt = params.prompt;
  const openaikey = userSettings.openaikey;
  const quality = userSettings.quality || "auto";
  const resolution = userSettings.resolution || "auto";
  const background = userSettings.background || "auto";
  const model = userSettings.model || "gpt-image-2.5-flare";

  if (!openaikey) {
    throw new Error(
      "No OpenAI key provided to the GPT Image plugin. Please enter your OpenAI key in the plugin settings and try again.",
    );
  }

  let attachedImages;
  if (params.images === undefined) {
    const cards = authorizedResources?.previousRunOutput?.cards;
    attachedImages = (Array.isArray(cards) ? cards : [])
      .filter((card) => card.type === "image" && card.image?.url)
      .map((card) => ({
        url: card.image.url,
        name: card.image.filename || "output.png",
      }));
  } else {
    if (!Array.isArray(params.images)) {
      throw new Error("images must be an array of attachment ids.");
    }
    attachedImages = params.images.map((id) => {
      const attachment = (authorizedResources?.attachments || []).find(
        (item) => item.id === id,
      );
      if (!attachment?.type?.startsWith("image/") || !attachment.url) {
        throw new Error(`Image attachment is not available: ${id}`);
      }
      return { url: attachment.url, name: attachment.name };
    });
  }

  const mode = attachedImages.length ? "edit" : "create";
  let resultBase64;

  if (mode === "create") {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + openaikey,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: resolution,
          quality,
          output_format: "png",
          background,
        }),
      },
    );

    if (response.status === 401) {
      throw new Error("Invalid OpenAI API Key. Please check your settings.");
    }
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    resultBase64 = data.data[0].b64_json;
  } else {
    const formData = new FormData();
    formData.append("model", model);
    formData.append("prompt", prompt);
    formData.append("n", 1);
    formData.append("size", resolution);
    formData.append("quality", quality);
    formData.append("output_format", "png");
    formData.append("background", background);

    for (const image of attachedImages) {
      const { blob, name } = await loadImageForEdit(image);
      formData.append("image[]", blob, name);
    }

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaikey}` },
      body: formData,
    });

    if (response.status === 401) {
      throw new Error("Invalid OpenAI API Key. Please check your settings.");
    }
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${await response.text()}`);
    }

    const result = await response.json();
    resultBase64 = result.data[0].b64_json;
  }

  return {
    cards: [
      {
        type: "image",
        image: {
          url: "data:image/png;base64," + resultBase64,
          alt: prompt.replace(/[[]]/, ""),
          filename:
            typeof params.filename === "string" && params.filename.trim()
              ? params.filename.trim()
              : undefined,
          sync: true,
        },
      },
    ],
  };
}

// Re-encodes the image to sRGB PNG/JPEG under the API size limit. Runs for
// every input: user uploads may carry color profiles or HDR gain maps, and
// re-encoding an already-clean PNG is harmless.
async function loadImageForEdit({ url, name }) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${response.status}`);
  }

  const source = await response.blob();

  const image = new Image();
  const canvas = document.createElement("canvas");
  const imageUrl = URL.createObjectURL(source);
  try {
    image.src = imageUrl;
    await image.decode();

    // Bound both canvas edges before allocating pixels for large photos (iOS).
    const initialScale = Math.min(
      1,
      4096 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    canvas.width = Math.max(1, Math.floor(image.naturalWidth * initialScale));
    canvas.height = Math.max(1, Math.floor(image.naturalHeight * initialScale));
    // Re-encode sRGB pixels instead of forwarding source profiles and HDR gain maps.
    const context = canvas.getContext("2d", {
      colorSpace: "srgb",
      colorType: "unorm8",
    });
    if (!context) {
      throw new Error("Unable to prepare image: canvas is unavailable.");
    }
    // JPEG is opaque; keep PNG for other inputs so transparency is preserved.
    const type = source.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const extension = type === "image/jpeg" ? ".jpg" : ".png";
    const maxBytes = 50_000_000;
    while (true) {
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, type, 0.92),
      );
      if (!blob) {
        throw new Error("Unable to encode image.");
      }
      if (blob.size < maxBytes) {
        return {
          blob,
          name: (name || "image").replace(/\.[^.]+$/, "") + extension,
        };
      }
      if (canvas.width === 1 && canvas.height === 1) {
        throw new Error("Unable to reduce image below 50 MB.");
      }
      const scale = Math.min(0.8, Math.sqrt(maxBytes / blob.size) * 0.9);
      canvas.width = Math.max(1, Math.floor(canvas.width * scale));
      canvas.height = Math.max(1, Math.floor(canvas.height * scale));
    }
  } finally {
    canvas.width = canvas.height = 0;
    image.removeAttribute("src");
    URL.revokeObjectURL(imageUrl);
  }
}
