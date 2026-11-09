import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PartnerGoalsView } from '../components/PartnerGoalsView';
import type { CommunityStackParamList } from '../navigation/CommunityStackNavigator';

type Props = NativeStackScreenProps<CommunityStackParamList, 'Partner'>;

export default function PartnerScreen({ navigation, route }: Props) {
  const { name, partnerId } = route.params;

  return (
    <PartnerGoalsView
      partnerId={partnerId}
      name={name}
      onOpenGoal={(goal) => {
        if (!partnerId) {
          return;
        }
        navigation.navigate('Goal', {
          goalId: goal.id,
          readOnly: true,
          ownerId: partnerId,
          sharedByName: name,
        });
      }}
    />
  );
}
