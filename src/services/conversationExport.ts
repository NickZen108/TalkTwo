import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { conversationExportHtml, type ExportParticipant } from '../domain/conversationExport';
import type { ChatMessage } from './messages';

export async function shareConversationPdf(
  title: string,
  participants: ExportParticipant[],
  messages: ChatMessage[],
  locale = 'en',
) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
  const { uri } = await Print.printToFileAsync({ html: conversationExportHtml(title, participants, messages, locale) });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: `Export ${title}`,
  });
}
