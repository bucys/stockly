import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type PlanId = 'free' | 'pro' | 'pro_annual';

export interface Plan {
  id: PlanId;
  name: string;
  subtitle: string;
  features: string[];
  badge?: string;
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    subtitle: 'For one small location',
    features: ['1 location', 'Up to 5 users', 'Up to 250 products', 'CSV export'],
  },
  {
    id: 'pro',
    name: 'Pro',
    subtitle: 'For growing teams',
    features: [
      'Up to 10 locations · 25 users',
      'Unlimited products',
      'CSV & XLSX import/export',
      'Full history & employee access control',
    ],
  },
  {
    id: 'pro_annual',
    name: 'Pro Annual',
    subtitle: 'Save 20% vs monthly',
    badge: 'Best value',
    features: [
      'Everything in Pro',
      'Save 20% billed yearly',
      'Priority improvements',
    ],
  },
];

export function planCtaLabel(planId: PlanId): string {
  switch (planId) {
    case 'free':
      return 'Start with Free';
    case 'pro':
      return 'Start with Pro';
    case 'pro_annual':
      return 'Start with Pro Annual';
  }
}

interface Props {
  selected: PlanId;
  onSelect: (id: PlanId) => void;
}

export function PlanPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.list}>
      {PLANS.map((p) => {
        const isOn = selected === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.card, isOn && styles.cardOn]}
            onPress={() => onSelect(p.id)}
            activeOpacity={0.85}
          >
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.subtitle}>{p.subtitle}</Text>
              </View>
              {p.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{p.badge}</Text>
                </View>
              ) : null}
              <View style={[styles.radio, isOn && styles.radioOn]}>
                {isOn && <View style={styles.radioDot} />}
              </View>
            </View>
            <View style={styles.features}>
              {p.features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={isOn ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  cardOn: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  name: { fontSize: 18, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.6,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colors.primary, borderWidth: 2 },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: theme.colors.primary,
  },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13, color: theme.colors.textSecondary, flex: 1, lineHeight: 18 },
});
