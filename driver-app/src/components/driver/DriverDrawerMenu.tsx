import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DriverAppTab } from '../../types/driver';
import { getDriverAccentColor, withDriverAccentAlpha } from './driverColor';
import { driverTheme } from './driverTheme';

type MenuItem = {
  key: DriverAppTab;
  label: string;
};

type Props = {
  activeTab: DriverAppTab;
  onChange: (tab: DriverAppTab) => void;
  onClose: () => void;
  driverName: string;
  driverKey: string;
};

const MENU_ITEMS: MenuItem[] = [
  { key: 'home', label: 'Home' },
  { key: 'trips', label: 'Trips' },
  { key: 'messages', label: 'Messages' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'gps', label: 'GPS' },
  { key: 'settings', label: 'Settings' },
  { key: 'profile', label: 'Profile' },
  { key: 'history', label: 'History' },
  { key: 'documents', label: 'Documents' },
  { key: 'help', label: 'Help' }
];

export const DriverDrawerMenu = ({ activeTab, onChange, onClose, driverName, driverKey }: Props) => {
  const driverAccent = getDriverAccentColor(driverKey);
  return <View style={styles.overlay}>
      <Pressable style={[styles.backdrop, { backgroundColor: withDriverAccentAlpha(driverAccent, 0.26) }]} onPress={onClose} />
      <View style={styles.drawer}>
        <View style={[styles.header, { backgroundColor: driverAccent }]}> 
          <Text style={styles.headerEyebrow}>Care Mobility</Text>
          <Text style={styles.headerTitle}>{driverName}</Text>
          <Text style={styles.headerBody}>Driver app navigation</Text>
        </View>

        <ScrollView contentContainerStyle={styles.menuList}>
          {MENU_ITEMS.map(item => <Pressable key={item.key} onPress={() => {
          onChange(item.key);
          onClose();
        }} style={[styles.menuItem, activeTab === item.key ? styles.menuItemActive : null, activeTab === item.key ? { backgroundColor: driverAccent, borderColor: driverAccent } : null]}>
              <Text style={[styles.menuItemText, activeTab === item.key ? styles.menuItemTextActive : null]}>{item.label}</Text>
            </Pressable>)}
        </ScrollView>
      </View>
    </View>;
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 50
  },
  backdrop: {
    flex: 1
  },
  drawer: {
    width: 290,
    backgroundColor: driverTheme.colors.surface,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderLeftWidth: 1,
    borderLeftColor: driverTheme.colors.border
  },
  header: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: 24,
    padding: 18,
    gap: 4
  },
  headerEyebrow: {
    color: '#ffffff',
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700'
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800'
  },
  headerBody: {
    color: 'rgba(255,255,255,0.9)'
  },
  menuList: {
    paddingTop: 18,
    gap: 8
  },
  menuItem: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  menuItemActive: {
    backgroundColor: driverTheme.colors.primary
  },
  menuItemText: {
    color: driverTheme.colors.text,
    fontWeight: '700',
    fontSize: 15
  },
  menuItemTextActive: {
    color: '#ffffff'
  }
});
