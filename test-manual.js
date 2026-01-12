// 手动测试新的查找逻辑
const fs = require('fs');
const path = require('path');

// 模拟一些简单的测试
const testFile = path.join(__dirname, 'test/test-image-references.html');
const imageFile = path.join(__dirname, 'test/images/test.jpg');

console.log('Test file:', testFile);
console.log('Image file:', imageFile);

// 检查文件是否存在
if (fs.existsSync(testFile)) {
    console.log('✅ Test HTML file exists');
} else {
    console.log('❌ Test HTML file not found');
}

if (fs.existsSync(imageFile)) {
    console.log('✅ Test image file exists');
} else {
    console.log('❌ Test image file not found');
}

console.log('Manual test setup complete. You can now test the extension with these files.');
