import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { conversationExportHtml, type ConversationExportCopy, type ExportParticipant } from '../domain/conversationExport';
import type { ChatMessage } from './messages';

export async function shareConversationPdf(title: string, participants: ExportParticipant[], messages: ChatMessage[], options: {
  locale: string;
  copy: ConversationExportCopy;
  sharingUnavailable: string;
  dialogTitle: string;
}) {
  if (!(await Sharing.isAvailableAsync())) throw new Error(options.sharingUnavailable);
  const { uri } = await Print.printToFileAsync({ html: conversationExportHtml(title, participants, messages, options.locale, options.copy) });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: options.dialogTitle,
  });
}
