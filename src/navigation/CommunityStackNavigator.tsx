import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CommunityScreen from '../screens/CommunityScreen';
import PartnerScreen from '../screens/PartnerScreen';

export type CommunityStackParamList = {
  CommunityMain: undefined;
  Partner: { connectionId: string; name: string };
};

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export default function CommunityStackNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="CommunityMain"
        component={CommunityScreen}
        options={{
          title: 'Community',
          headerBackTitle: 'Community',
          headerTitleAlign: 'center',
        }}
      />
      <Stack.Screen
        name="Partner"
        component={PartnerScreen}
        options={({ route }) => ({
          title: route.params.name,
          headerTitleAlign: 'center',
        })}
      />
    </Stack.Navigator>
  );
}
