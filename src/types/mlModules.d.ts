// 这些重型依赖通过动态 import 在 worker 中按需加载，仅声明为 any，
// 避免在未安装/未联网时阻塞编译（实际类型在运行时由各自包提供）。
declare module "@huggingface/transformers";
declare module "sharp";
declare module "tesseract.js";
