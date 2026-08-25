import fs from 'node:fs';

const files = {
  chat: fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8'),
  home: fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8'),
  settings: fs.readFileSync('src/screens/ChatSettingsScreen.tsx', 'utf8'),
  privacy: fs.readFileSync('src/components/PartnerAvailabilityCard.tsx', 'utf8'),
  login: fs.readFileSync('src/screens/LoginScreen.tsx', 'utf8'),
  windows: fs.readFileSync('src/screens/MessageWindowsScreen.tsx', 'utf8'),
  feedback: fs.readFileSync('src/screens/FeedbackScreen.tsx', 'utf8'),
  account: fs.readFileSync('src/screens/AccountScreen.tsx', 'utf8'),
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
requireText('chat', files.chat, "compactButton: { minHeight: 44", 'Open/Reject/View-document touch targets must remain at least 44pt high');
requireText('chat', files.chat, "trialStrip: { minHeight: 44", 'Premium-trial action must remain at least 44pt high');
requireText('chat', files.chat, "cancelAttachmentButton: { minHeight: 44, minWidth: 44", 'attachment cancel touch target must remain at least 44x44pt');
requireText('chat', files.chat, "rewriteButton: { minHeight: 44", 'AI rewrite action must remain at least 44pt high');

requireText('home', files.home, "chatText: { flex: 1, minWidth: 0 }", 'chat titles must shrink beside avatar and chevron');
requireText('home', files.home, "invitationBanner: {", 'invitation banner style is missing');
requireText('home', files.home, "flexWrap: 'wrap'", 'home banners/actions need a wrap path for narrow screens or large text');
requireText('home', files.home, "headerButton: { minHeight: 44", 'header action must remain at least 44pt high');
requireText('home', files.home, "action: { minHeight: 44", 'primary Home actions must remain at least 44pt high');
requireText('home', files.home, "appearanceChip: { minHeight: 44", 'appearance selectors must remain at least 44pt high');

requireText('settings', files.settings, "headerText: { flex: 1, minWidth: 0 }", 'settings title area must shrink beside back control');
requireText('settings', files.settings, "memberText: { flex: 1, minWidth: 0 }", 'member names must shrink beside initials');
requireText('settings', files.settings, "twoButtons: { flexDirection: 'row', flexWrap: 'wrap'", 'approval buttons must wrap instead of colliding');
requireText('settings', files.settings, "themeGrid: { flexDirection: 'row', flexWrap: 'wrap'", 'theme choices must wrap');
requireText('settings', files.settings, "colorRow: { flexDirection: 'row', flexWrap: 'wrap'", 'bubble colour choices must wrap');
requireText('settings', files.settings, "backButton: { width: 44, minHeight: 44", 'settings back button must remain at least 44pt');
requireText('settings', files.settings, "removeButton: { minHeight: 44", 'Personal Boundary remove action must remain at least 44pt high');
requireText('settings', files.settings, "colorDot: { width: 44, height: 44", 'bubble colour selectors must remain at least 44x44pt');
requireText('settings', files.settings, "button: { minHeight: 46", 'settings primary actions must remain at least 44pt high');

requireText('privacy', files.privacy, "button: { minHeight: 44", 'mute/block privacy controls must remain at least 44pt high');

requireText('login', files.login, "languageButton: { minHeight: 44", 'language selectors must remain at least 44pt high');
requireText('login', files.login, "button: { minHeight: 44", 'login primary action must remain at least 44pt high');
requireText('login', files.login, "secondary: { minHeight: 44", 'login secondary action must remain at least 44pt high');

requireText('windows', files.windows, "backButton: { minHeight: 44", 'message-window back action must remain at least 44pt high');
requireText('windows', files.windows, "button: { minHeight: 44", 'timezone save action must remain at least 44pt high');
requireText('windows', files.windows, "timeInput: { width: 90, minHeight: 44", 'time inputs must remain at least 44pt high');
requireText('windows', files.windows, "saveDay: { alignSelf: 'flex-start', minHeight: 44", 'per-day save action must remain at least 44pt high');

requireText('feedback', files.feedback, "backButton: { marginTop: 16, minHeight: 44", 'feedback back action must remain at least 44pt high');
requireText('feedback', files.feedback, "chip: { minHeight: 44", 'feedback category selectors must remain at least 44pt high');
requireText('feedback', files.feedback, "button: { minHeight: 44", 'feedback send action must remain at least 44pt high');
requireText('feedback', files.feedback, 'accessibilityState={{ selected: category === item.id }}', 'feedback category state must remain exposed to assistive technology');

requireText('account', files.account, "headerText: { flex: 1, minWidth: 0 }", 'account screen title must shrink beside the back control');

for (const key of ['chat', 'home', 'settings']) {
  if (/<Image(?:\s|>)/.test(files[key])) failures.push(`${key}: profile/chat UI must not render user profile photos`);
}

if (failures.length) {
  console.error('Layout safety gate failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Layout safety gate passed. Responsive shrink/wrap guards, accessible core touch targets and no-profile-photo rule are intact.');
