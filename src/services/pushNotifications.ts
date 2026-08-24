import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';

const PUSH_TOKEN_KEY = 'talktwo.expoPushToken.v1';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function easProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

async function configureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'New messages',
    description: 'Private alerts that a TalkTwo message is ready. Message text is never included.',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 200, 120, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

async function registerToken(token: string) {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
  if (!platform) throw new Error('Push notifications are available only on iOS and Android.');
  const { error } = await supabase.rpc('register_push_device', {
    expo_token: token,
    device_platform: platform,
  });
  if (error) throw error;
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token, secureOptions);
}

async function setGlobalNotificationMute(muted: boolean) {
  const { error } = await supabase.rpc('set_my_notification_mute', {
    rel_id: null,
    target_sender: null,
    muted,
  });
  if (error) throw error;
}

async function globalNotificationsMuted() {
  const { data, error } = await supabase.rpc('list_my_notification_mutes', { rel_id: null });
  if (error) throw error;
  return (data ?? []).some((item: { relationship_id?: string | null; sender_id?: string | null }) => (
    item.relationship_id == null && item.sender_id == null
  ));
}

export async function pushNotificationStatus() {
  const permission = (await Notifications.getPermissionsAsync()).status;
  const localToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY, secureOptions);
  if (!localToken) return { enabled: false, permission };
  const [{ data, error }, globallyMuted] = await Promise.all([
    supabase.rpc('is_push_device_registered', { expo_token: localToken }),
    globalNotificationsMuted(),
  ]);
  if (error) throw error;
  return { enabled: Boolean(data) && !globallyMuted, permission };
}

export async function enablePushNotifications() {
  if (!Device.isDevice) throw new Error('Push notifications require a physical iPhone or Android device.');
  const projectId = easProjectId();
  if (!projectId) throw new Error('Push activation is waiting for the TalkTwo EAS project ID.');
  await configureAndroidChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Notification permission was not granted. You can enable it later in device settings.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerToken(token);
  await setGlobalNotificationMute(false);
  return token;
}

export async function disablePushNotifications() {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY, secureOptions);
  let globalMuteError: unknown = null;
  let remoteError: unknown = null;

  try {
    await setGlobalNotificationMute(true);
  } catch (error) {
    globalMuteError = error;
  }

  if (token) {
    const { error } = await supabase.rpc('disable_push_device', { expo_token: token });
    remoteError = error;
  }
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY, secureOptions);
  await Notifications.unregisterForNotificationsAsync().catch(() => undefined);
  if (globalMuteError) throw globalMuteError;
  if (remoteError) throw remoteError;
}

export async function refreshPushRegistrationIfEnabled() {
  const existing = await SecureStore.getItemAsync(PUSH_TOKEN_KEY, secureOptions);
  if (!existing || !Device.isDevice) return;
  const projectId = easProjectId();
  if (!projectId) return;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return;
  await configureAndroidChannel();
  const next = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerToken(next);
  if (next !== existing) {
    try {
      await supabase.rpc('disable_push_device', { expo_token: existing });
    } catch {
      // The refreshed token remains active even if stale-token cleanup must retry later.
    }
  }
}

export function addPushTokenRefreshListener() {
  return Notifications.addPushTokenListener(() => {
    void refreshPushRegistrationIfEnabled().catch(() => undefined);
  });
}
