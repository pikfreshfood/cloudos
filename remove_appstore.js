const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'src/screens');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Pattern to match the AppStoreScreen touchable opacity block
  const pattern = /\s*<TouchableOpacity style=\{styles\.navBtn\} onPress=\{\(\) => navigation\.navigate\('AppStoreScreen'\)\}>\s*<Ionicons name="cart"[^>]+>\s*<\/TouchableOpacity>/g;
  
  if (pattern.test(content)) {
    content = content.replace(pattern, '');
    fs.writeFileSync(filePath, content);
    console.log('Removed AppStore from bottomNav in ' + file);
  }
});
