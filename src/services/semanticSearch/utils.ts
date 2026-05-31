// 语义搜索的纯函数工具（无 vscode / 无重型依赖，宿主与 worker 共用）。

/** 判断查询是否以中文为主：CJK 字符占非空白字符比例 > 0.5。 */
export function isChineseQuery(query: string): boolean {
  const stripped = query.replace(/\s+/g, "");
  if (!stripped) return false;
  let cjk = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 统一表意文字
      (cp >= 0x3400 && cp <= 0x4dbf) || // 扩展 A
      (cp >= 0xf900 && cp <= 0xfaff) // 兼容表意文字
    ) {
      cjk++;
    }
  }
  return cjk / stripped.length > 0.5;
}

const PROMPT_PREFIXES = [
  "a photo of ",
  "an image of ",
  "a picture of ",
  "photo of ",
  "image of ",
];

/** 去除查询中可能已有的 prompt 前缀，得到裸主题。 */
export function stripPromptPrefix(text: string): string {
  let subject = text.trim();
  const lower = subject.toLowerCase();
  for (const prefix of PROMPT_PREFIXES) {
    if (lower.startsWith(prefix)) {
      subject = subject.slice(prefix.length).trim();
      break;
    }
  }
  return subject;
}

/** 基于裸主题构造 5 个 prompt（ensemble）。 */
export function buildPrompts(subject: string): string[] {
  return [
    `a photo of ${subject}`,
    `an image of ${subject}`,
    `a picture of ${subject}`,
    `a photograph showing ${subject}`,
    `${subject}`,
  ];
}

/** 对向量做 L2 归一化（原地返回新数组）。 */
export function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

/** 余弦相似度。输入向量若已归一化，结果即为点积。 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** 多个归一化向量求均值后再次归一化。 */
export function meanPool(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const acc = new Array<number>(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += vec[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length;
  return l2Normalize(acc);
}

/** 将原始 query 切成关键词 token（小写、去非单词/非中文、过滤长度 <= 1）。 */
export function tokenizeForOcr(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}一-鿿\s]/gu, " ");
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

/** OCR 关键词覆盖率得分：命中 token 数 / 查询 token 数。 */
export function ocrCoverageScore(query: string, ocrText: string): number {
  const tokens = tokenizeForOcr(query);
  if (tokens.length === 0 || !ocrText) return 0;
  const haystack = ocrText.toLowerCase();
  let matched = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) matched++;
  }
  return matched / tokens.length;
}
