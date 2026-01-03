// 测试图片标签正则表达式的简单脚本
const EXT_REGEX = "(jpg|jpeg|png|gif|svg|webp|ico|bmp)";

const HTML_ATTR_RE = new RegExp(
  `\\b(?:src|href|data-src|poster|srcset|data-srcset|data-lazy-src|data-original)\\s*=\\s*['"]([^'"]+\\.(${EXT_REGEX}))['"]`,
  "gi"
);

// Vue 动态绑定字符串字面量 (:attr="'value'" 或 :attr="`value`")
const VUE_BINDING_RE = new RegExp(
  `\\b(?:v-bind:)?(src|href|poster|data-src|data-lazy-src|data-original)\\s*=\\s*['"\`]([^'"\`]+\\.(${EXT_REGEX}))['"\`]`,
  "gi"
);

// React JSX 字符串字面量 (attr={'value'} 或 attr={`value`})
const REACT_JSX_BINDING_RE = new RegExp(
  `\\b(src|href|poster|data-src|data-lazy-src|data-original)\\s*=\\s*\\{['"\`]([^'"\`]+\\.(${EXT_REGEX}))['"\`]\\}`,
  "gi"
);

// srcset 属性特殊处理 (支持 srcset="img1.jpg 1x, img2.jpg 2x" 格式)
const SRCSET_RE = new RegExp(
  `\\b(?:srcset|data-srcset)\\s*=\\s*['"]([^'"]*?(\\w[^'"]*?\\.${EXT_REGEX})[^'"]*?)['"]`,
  "gi"
);

const GENERIC_QUOTED_RE = new RegExp(`['"]([^'"]+\\.(${EXT_REGEX}))['"]`, "gi");

const URL_RE = new RegExp(
  `url\\(\\s*['"]?([^'")\\s]+?\\.(${EXT_REGEX}))['"]?\\s*\\)`,
  "gi"
);

// 测试用例
const testCases = [
  // HTML 标准标签
  '<img src="image.jpg" />',
  '<img src="path/to/image.png" alt="test" />',
  '<img srcset="image.jpg 1x, image@2x.jpg 2x" />',
  '<img data-src="lazy-image.jpg" />',
  '<img data-lazy-src="lazy.jpg" />',

  // Vue 动态绑定 (字符串字面量)
  '<img :src="\'image.jpg\'" />',
  '<img :src="`dynamic.jpg`" />',
  '<img :data-src="\'lazy.jpg\'" />',

  // React JSX (字符串字面量)
  '<img src={"image.jpg"} />',
  '<img src={`dynamic.jpg`} />',
  '<img data-src={"lazy.jpg"} />',

  // CSS
  'background: url("bg.jpg");',
  'background-image: url(image.png);',
  'background: url(\'bg.svg\');',

  // JavaScript
  'import image from "logo.svg";',
  'const img = require("icon.png");'
];

console.log("测试正则表达式匹配结果：\n");

testCases.forEach((testCase, index) => {
  console.log(`测试用例 ${index + 1}: ${testCase}`);

  const matches = [];

  // 测试 URL 函数
  URL_RE.lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(testCase)) !== null) {
    matches.push({ type: 'URL', path: match[1] });
  }

  // 测试 HTML 属性
  HTML_ATTR_RE.lastIndex = 0;
  while ((match = HTML_ATTR_RE.exec(testCase)) !== null) {
    matches.push({ type: 'HTML_ATTR', path: match[1] });
  }

  // 测试 Vue 绑定
  VUE_BINDING_RE.lastIndex = 0;
  while ((match = VUE_BINDING_RE.exec(testCase)) !== null) {
    matches.push({ type: 'VUE_BINDING', path: match[2] });
  }

  // 测试 React JSX
  REACT_JSX_BINDING_RE.lastIndex = 0;
  while ((match = REACT_JSX_BINDING_RE.exec(testCase)) !== null) {
    matches.push({ type: 'REACT_JSX', path: match[2] });
  }

  // 测试 srcset
  SRCSET_RE.lastIndex = 0;
  while ((match = SRCSET_RE.exec(testCase)) !== null) {
    matches.push({ type: 'SRCSET', path: match[2] });
  }

  // 测试通用引号
  GENERIC_QUOTED_RE.lastIndex = 0;
  while ((match = GENERIC_QUOTED_RE.exec(testCase)) !== null) {
    // 避免与其他正则重复
    if (!matches.some(m => m.path === match[1])) {
      matches.push({ type: 'GENERIC', path: match[1] });
    }
  }

  if (matches.length > 0) {
    matches.forEach(m => console.log(`  ✓ ${m.type}: ${m.path}`));
  } else {
    console.log("  ✗ 无匹配");
  }

  console.log("");
});
