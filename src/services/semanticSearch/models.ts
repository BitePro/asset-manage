// 模型标识与所需文件清单（参照 tel.md）。
// 这些文件会被下载到 <cacheDir>/<modelId>/<file>，与 @huggingface/transformers
// 以 localModelPath 加载时的目录布局一致。

export const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
export const TRANSLATION_MODEL_ID = "Xenova/opus-mt-zh-en";

/** 某个模型的相对文件路径清单。 */
export interface ModelManifest {
  modelId: string;
  files: string[];
}

/** CLIP 视觉 + 文本（拆分）模型所需文件。 */
export const CLIP_MANIFEST: ModelManifest = {
  modelId: CLIP_MODEL_ID,
  files: [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "preprocessor_config.json",
    "vocab.json",
    "merges.txt",
    "onnx/vision_model.onnx",
    "onnx/text_model.onnx",
  ],
};

/** 中文→英文翻译模型（q8 量化）所需文件。 */
export const TRANSLATION_MANIFEST: ModelManifest = {
  modelId: TRANSLATION_MODEL_ID,
  files: [
    "config.json",
    "generation_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "source.spm",
    "target.spm",
    "vocab.json",
    "onnx/encoder_model_quantized.onnx",
    "onnx/decoder_model_merged_quantized.onnx",
  ],
};

/** OCR 语言包（tesseract.js tessdata_fast）。 */
export const OCR_LANGS = ["eng", "chi_sim"];
export const OCR_TESSDATA_BASE =
  "https://github.com/tesseract-ocr/tessdata_fast/raw/main";

/** 返回需要确保存在的模型清单（OCR 单独处理）。 */
export function requiredManifests(): ModelManifest[] {
  return [CLIP_MANIFEST, TRANSLATION_MANIFEST];
}
