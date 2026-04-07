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
          <Text style={styles.headerEyebrow}>Florida Mobility Group</Text>
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
    width: 280,
    backgroundColor: driverTheme.colors.surface,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderLeftWidth: 1,
    borderLeftColor: driverTheme.colors.border
  },
  header: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: 0,
    padding: 20,
    paddingTop: 28,
    gap: 4
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700'
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2
  },
  headerBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 2
  },
  menuList: {
    paddingTop: 8,
    paddingHorizontal: 0,
    gap: 0
  },
  menuItem: {
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: driverTheme.colors.border
  },
  menuItemActive: {
    backgroundColor: driverTheme.colors.primarySoft,
    borderLeftWidth: 3,
    borderLeftColor: driverTheme.colors.primary,
    paddingLeft: 17
  },
  menuItemText: {
    color: driverTheme.colors.textMuted,
    fontWeight: '600',
    fontSize: 15
  },
  menuItemTextActive: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  }
});
