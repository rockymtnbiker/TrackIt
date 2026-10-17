import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { handleReminderResponse, rebuildReminders } from '../lib/reminders';

/** Reschedules local reminders when the app opens or returns, and opens Do when one is tapped. */
export function ReminderSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      return;
    }
    void rebuildReminders();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void rebuildReminders();
      }
    });
    return () => subscription.remove();
  }, [user]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleReminderResponse(response);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) =>
      handleReminderResponse(response),
    );
    return () => subscription.remove();
  }, []);

  return null;
}
