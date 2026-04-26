import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverAppTab } from '../../types/driver';
import { driverTheme } from './driverTheme';

type TabItem = {
  key: DriverAppTab;
  label: string;
  badge?: number;
};

type Props = {
  activeTab: DriverAppTab;
  items: TabItem[];
  onChange: (tab: DriverAppTab) => void;
};

export const DriverTabBar = ({ activeTab, items, onChange }: Props) => {
  return <View style={styles.tabRow}>
      {items.map(item => <Pressable key={item.key} onPress={() => onChange(item.key)} style={[styles.tabButton, activeTab === item.key ? styles.tabButtonActive : null]}>
          <Text style={[styles.tabText, activeTab === item.key ? styles.tabTextActive : null]}>{item.label}</Text>
          {item.badge ? <View style={[styles.badge, activeTab === item.key ? styles.badgeActive : null]}>
              <Text style={[styles.badgeText, activeTab === item.key ? styles.badgeTextActive : null]}>{item.badge}</Text>
            </View> : null}
        </Pressable>)}
    </View>;
};

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    padding: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
    borderRadius: driverTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  tabButtonActive: {
    backgroundColor: driverTheme.colors.headerBg
  },
  tabText: {
    color: driverTheme.colors.textMuted,
    fontWeight: '700'
  },
  tabTextActive: {
    color: driverTheme.colors.white
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: driverTheme.radius.sm,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeActive: {
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  badgeText: {
    color: driverTheme.colors.text,
    fontSize: 11,
    fontWeight: '800'
  },
  badgeTextActive: {
    color: driverTheme.colors.white
  }
});