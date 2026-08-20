import fs from 'node:fs';

const files = {
  chat: fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8'),
  home: fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8'),
  settings: fs.readFileSync('src/screens/ChatSettingsScreen.tsx', 'utf8'),
  login: fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8'),
  windows: fs.readFileSync('src/screens/MessageWindowsScreen.tsx', 'utf8'),
  feedback: fs.readFileSync('src/screens/FeedbackScreen.tsx', 'utf8'),
};

const failures = [];

function requireText(name, source, needle, explanation) {
  if (!source.includes(needle)) failures.push(`${name}: ${explanation}`);
}

for (const [name, source] of Object.entries(files)) {
  if (/fontWeight\s*:\s*['"](?:150|250|350|450|550|650|750|850|950)['"]/.test(source)) {
    failures.push(`${name}: unsupported intermediate fontWeight can break native layout/typechecking`);
  }
  if (/StyleSheet\.absoluteFillObject/.test(source)) {
    failures.push(`${name}: deprecated absoluteFillObject is not allowed`);
  }
}

requireText('chat', files.chat, "headerText: { flex: 1, minWidth: 0 }", 'chat header text must be allowed to shrink instead of overlapping controls');
requireText('chat', files.chat, "inputShell: { flex: 1, minWidth: 0", 'composer input must shrink on narrow screens');
requireText('chat', files.chat, "bubble: { maxWidth: '82%'", 'message bubbles need a bounded responsive width');
requireText('chat', files.chat, "senderControls: {", 'sender controls must remain in the responsive style sheet');
requireText('chat', files.chat, "flexWrap: 'wrap'", 'chat actions need a wrap path for narrow screens or large text');
requireText('home', files.home, "chatText: { flex: 1, minWidth: 0 }", 'chat titles must shrink beside avatar and chevron');
requireText('home', files.home, "invitationBanner: {", 'invitation banner style is missing');
requireText('home', files.home, "flexWrap: 'wrap'", 'home banners/actions need a wrap path for narrow screens');
requireText('settings', files.settings, "headerText: { flex: 1, minWidth: 0 }", 'settings title area must shrink beside back control');
requireText('settings', files.settings, "memberText: { flex: 1, minWidth: 0 }", 'member names must shrink beside initials');
requireText('settings', files.settings, "twoButtons: { flexDirection: 'row', flexWrap: 'wrap'", 'approval buttons must wrap instead of colliding');
requireText('settings', files.settings, "themeGrid: { flexDirection: 'row', flexWrap: 'wrap'", 'theme choices must wrap');
requireText('settings', files.settings, "colorRow: { flexDirection: 'row', flexWrap: 'wrap'", 'bubble colour choices must wrap');

for (const key of ['chat', 'home', 'settings']) {
  if (/<Image(?:\s|>)/.test(files[key])) failures.push(`${key}: profile/chat UI must not render user profile photos`);
}

if (failures.length) {
  console.error('Layout safety gate failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Layout safety gate passed. Responsive shrink/wrap guards and no-profile-photo rule are intact.');
