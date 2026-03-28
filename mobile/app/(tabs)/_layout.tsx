import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#534AB7',
      tabBarInactiveTintColor: '#9ca3af',
      tabBarStyle: {
        borderTopColor: '#f3f4f6',
        paddingBottom: 4,
      },
    }}>
      <Tabs.Screen
        name="outreach"
        options={{
          title: 'Outreach',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="carriers"
        options={{
          title: 'Find Carriers',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔍</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}