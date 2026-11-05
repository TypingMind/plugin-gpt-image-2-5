## GPT Image 2.6

Generate or edit an image with OpenAI's GPT Image models. Select [GPT Image 2.6 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare), GPT Image 2.6 Sunburst, GPT Image 2.5 Flare, or GPT Image 2.5 Sunburst in the plugin settings. The default is GPT Image 2.6 Flare.

Make sure you’ve entered your OpenAI API key in settings.

The model selects PNG (default), JPEG, WebP, GIF, or SVG for each request using the `output_format` parameter. GIF and SVG require GPT Image 2.6. For animated GIFs, describe the motion and desired loop in your prompt.

Set **SVG Model** in plugin settings to an SVG-authoring model ID available to your account. For SVG output, the plugin sends this as `svg.model`, separately from the image model selected in **Model**. Leave it blank when SVG model selection is disabled for your account; the plugin will omit the `svg` options.

Example usage:

> Generate a picture of a cat

> [Image Attachment] Add a hat to this cat
