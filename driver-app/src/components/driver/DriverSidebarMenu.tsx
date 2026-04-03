import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { driverSharedStyles, driverTheme } from './driverTheme';

type Props = {
  runtime: DriverRuntime;
};

export const DriverSidebarMenu = ({ runtime }: Props) => {
  const name = runtime.driverSession?.name || runtime.driverCode || 'Driver';
  const stats = (runtime.driverSession as any)?.stats || { hours: '10.2', km: '30 KM', trips: '20' };

  return <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.avatarPlaceholder} />
          <View style={styles.identity}>
            <Text style={styles.name}>{name}</Text>
            <View style={styles.rolePill}><Text style={styles.roleText}>Care Mobility</Text></View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}><Text style={styles.statValue}>{stats.hours}</Text><Text style={styles.statLabel}>Hours driving</Text></View>
          <View style={styles.statItem}><Text style={styles.statValue}>{stats.km}</Text><Text style={styles.statLabel}>Total distance</Text></View>
          <View style={styles.statItem}><Text style={styles.statValue}>{stats.trips}</Text><Text style={styles.statLabel}>Total trips</Text></View>
        </View>
      </View>

      <View style={styles.menuList}>
        <MenuItem label="Home" onPress={() => runtime.setActiveTab('home')} />
        <MenuItem label="My Wallet" onPress={() => {}} />
        <MenuItem label="History" onPress={() => {}} />
        <MenuItem label="Notifications" onPress={() => runtime.setActiveTab('messages')} />
        <MenuItem label="Invite Friends" onPress={() => {}} />
        <MenuItem label="Settings" onPress={() => runtime.setActiveTab('settings')} />
        <MenuItem label="Logout" onPress={() => void runtime.signOut()} danger />
      </View>
    </View>;
};

const MenuItem = ({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) => {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed ? { opacity: 0.7 } : null]}>
      <Text style={[styles.menuLabel, danger ? { color: '#b54737' } : null]}>{label}</Text>
    </Pressable>;
};

const styles = StyleSheet.create({
  container: {
    gap: 12
  },
  header: {
    backgroundColor: driverTheme.colors.headerBg,
    borderRadius: driverTheme.radius.xl,
    padding: 18,
    gap: 12
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff'
  },
  identity: {
    flex: 1
  },
  name: {
    color: driverTheme.colors.headerText,
    fontSize: 18,
    fontWeight: '800'
  },
  rolePill: {
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    alignSelf: 'flex-start'
  },
  roleText: {
    color: driverTheme.colors.headerText,
    fontWeight: '700',
    fontSize: 12
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6
  },
  statItem: {
    flex: 1
  },
  statValue: {
    color: driverTheme.colors.headerText,
    fontWeight: '800',
    fontSize: 16
  },
  statLabel: {
    color: 'rgba(20,54,69,0.7)',
    fontSize: 11
  },
  menuList: {
    backgroundColor: driverTheme.colors.surface,
    borderRadius: driverTheme.radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  menuItem: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef5f7'
  },
  menuLabel: {
    color: driverTheme.colors.text,
    fontWeight: '700'
  }
});

export default DriverSidebarMenu;
