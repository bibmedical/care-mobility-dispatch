import { Pressable, StyleSheet, Text, View, Linking } from 'react-native';
import { DriverRuntime } from '../../hooks/useDriverRuntime';
import { getDriverAccentColor, withDriverAccentAlpha } from './driverColor';
import { driverSharedStyles, driverTheme } from './driverTheme';
import { getTripTone, getTripWindow } from './driverUtils';

type Props = {
  runtime: DriverRuntime;
};

const openPhoneCall = async (phoneNumber?: string) => {
  const digits = String(phoneNumber || '').replace(/\D+/g, '');
  if (!digits) return;
  await Linking.openURL(`tel:${digits}`);
};

export const DriverActiveTripSection = ({ runtime }: Props) => {
  const driverAccent = getDriverAccentColor({
    id: runtime.driverSession?.driverId,
    name: runtime.driverSession?.name || runtime.driverCode
  });
  const activeTrip = runtime.activeTrip;

  const renderSupportBadges = () => {
    const isWillCall = Boolean(activeTrip?.isWillCall) || String(activeTrip?.status || '').trim().toLowerCase() === 'willcall';
    if (!activeTrip || (!isWillCall && !activeTrip.hasServiceAnimal && !activeTrip.mobilityType && !activeTrip.assistLevel)) return null;

    return <View style={styles.supportBadgeRow}>
        {isWillCall ? <View style={[styles.supportBadge, styles.supportBadgeWillCall]}>
            <Text style={styles.supportBadgeWillCallText}>WILLCALL</Text>
          </View> : null}
        {activeTrip.hasServiceAnimal ? <View style={[styles.supportBadge, styles.supportBadgeAnimal]}>
            <Text style={styles.supportBadgeAnimalText}>🐕 Service Animal</Text>
          </View> : null}
        {activeTrip.mobilityType ? <View style={styles.supportBadge}>
            <Text style={styles.supportBadgeText}>{activeTrip.mobilityType}</Text>
          </View> : null}
        {activeTrip.assistLevel ? <View style={styles.supportBadge}>
            <Text style={styles.supportBadgeText}>{activeTrip.assistLevel}</Text>
          </View> : null}
      </View>;
  };

  return <View style={[driverSharedStyles.card, { borderColor: withDriverAccentAlpha(driverAccent, 0.24) }]}>
      <View style={driverSharedStyles.rowBetween}>
        <View style={styles.copyBlock}>
          <Text style={driverSharedStyles.eyebrow}>Active trip workspace</Text>
          <Text style={driverSharedStyles.title}>{runtime.activeTrip?.rider || 'Select a trip from Home'}</Text>
          <Text style={driverSharedStyles.body}>{runtime.activeTrip ? `${runtime.activeTrip.rideId || runtime.activeTrip.id} | ${getTripWindow(runtime.activeTrip)}` : 'The selected trip becomes the operational card shown here.'}</Text>
        </View>
        {runtime.activeTrip ? <View style={[driverSharedStyles.pill, { backgroundColor: getTripTone(runtime.activeTrip.punctualityVariant) }]}>
            <Text style={driverSharedStyles.pillText}>{runtime.activeTrip.punctualityLabel || runtime.activeTrip.status || 'Pending'}</Text>
          </View> : null}
      </View>

      {runtime.activeTrip ? <>
          <View style={[styles.routeBox, { borderColor: withDriverAccentAlpha(driverAccent, 0.18) }]}>
            <View style={styles.routeRow}>
              <View style={styles.routeMarkerPickup} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeText}>{runtime.activeTrip.address}</Text>
              </View>
              <Text style={styles.routeTime}>{runtime.activeTrip.scheduledPickup || runtime.activeTrip.pickup || '--'}</Text>
            </View>
            <View style={styles.routeDivider} />
            <View style={styles.routeRow}>
              <View style={[styles.routeMarkerDropoff, { backgroundColor: driverAccent }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Dropoff</Text>
                <Text style={styles.routeText}>{runtime.activeTrip.destination}</Text>
              </View>
              <Text style={styles.routeTime}>{runtime.activeTrip.scheduledDropoff || runtime.activeTrip.dropoff || '--'}</Text>
            </View>
          </View>

          {renderSupportBadges()}

          <View style={styles.actionGrid}>
            <Pressable style={styles.actionSoft} onPress={() => void openPhoneCall(runtime.activeTrip?.patientPhoneNumber)}>
              <Text style={styles.actionSoftText}>Call rider</Text>
            </Pressable>
            <Pressable style={[styles.actionSoft, { backgroundColor: withDriverAccentAlpha(driverAccent, 0.12) }, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('en-route')} disabled={runtime.activeTripAction.length > 0}>
              <Text style={[styles.actionSoftText, { color: driverAccent }]}>{runtime.activeTripAction === 'en-route' ? 'Sending...' : 'En Route'}</Text>
            </Pressable>
            <Pressable style={[styles.actionSoft, { backgroundColor: withDriverAccentAlpha(driverAccent, 0.12) }, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('arrived')} disabled={runtime.activeTripAction.length > 0}>
              <Text style={[styles.actionSoftText, { color: driverAccent }]}>{runtime.activeTripAction === 'arrived' ? 'Sending...' : 'Arrived'}</Text>
            </Pressable>
            <Pressable style={[styles.actionDark, { backgroundColor: driverAccent }, runtime.activeTripAction ? styles.actionDisabled : null]} onPress={() => void runtime.submitTripAction('complete')} disabled={runtime.activeTripAction.length > 0}>
              <Text style={styles.actionDarkText}>{runtime.activeTripAction === 'complete' ? 'Sending...' : 'Complete'}</Text>
            </Pressable>
          </View>

          {runtime.tripActionError ? <Text style={driverSharedStyles.warningText}>{runtime.tripActionError}</Text> : null}

          <View style={styles.infoGrid}>
            <View style={styles.infoPanel}>
              <Text style={styles.infoLabel}>Patient phone</Text>
              <Text style={styles.infoValue}>{runtime.activeTrip.patientPhoneNumber || 'No phone on file'}</Text>
            </View>
            <View style={styles.infoPanel}>
              <Text style={styles.infoLabel}>Late minutes</Text>
              <Text style={styles.infoValue}>{runtime.activeTrip.lateMinutes || '0'}</Text>
            </View>
          </View>

          <View style={driverSharedStyles.softCard}>
            <Text style={driverSharedStyles.title}>Dispatcher notes</Text>
            <Text style={driverSharedStyles.body}>{runtime.activeTrip.notes?.trim() || 'No notes for this trip.'}</Text>
          </View>

          <View style={[driverSharedStyles.softCard, runtime.lateRiskTrip?.id === runtime.activeTrip.id ? styles.escalationCard : null]}>
            <Text style={driverSharedStyles.title}>Rapid escalation</Text>
            <Text style={driverSharedStyles.body}>If this run is slipping, notify dispatch immediately so they can decide on backup driver or Uber coverage.</Text>
            <View style={styles.actionGrid}>
              <Pressable style={styles.actionSoft} onPress={() => void runtime.sendPresetDriverAlert('delay')}>
                <Text style={styles.actionSoftText}>Report delay</Text>
              </Pressable>
              <Pressable style={styles.actionSoft} onPress={() => void runtime.sendPresetDriverAlert('backup-driver')}>
                <Text style={styles.actionSoftText}>Backup driver</Text>
              </Pressable>
              <Pressable style={styles.actionDark} onPress={() => void runtime.sendPresetDriverAlert('request-uber')}>
                <Text style={styles.actionDarkText}>Request Uber</Text>
              </Pressable>
            </View>
          </View>
        </> : <Text style={driverSharedStyles.emptyText}>Select one trip from the Home tab to start working the route here.</Text>}
    </View>;
};

const styles = StyleSheet.create({
  copyBlock: {
    flex: 1
  },
  routeBox: {
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  routeTextBlock: {
    flex: 1
  },
  routeMarkerPickup: {
    width: 12,
    height: 12,
    borderRadius: driverTheme.radius.pill,
    backgroundColor: driverTheme.colors.info,
    marginTop: 5
  },
  routeMarkerDropoff: {
    width: 12,
    height: 12,
    borderRadius: driverTheme.radius.pill,
    backgroundColor: driverTheme.colors.accent,
    marginTop: 5
  },
  routeLabel: {
    color: driverTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  routeText: {
    color: driverTheme.colors.text,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 2
  },
  routeTime: {
    color: driverTheme.colors.text,
    fontWeight: '800'
  },
  routeDivider: {
    marginLeft: 5,
    height: 18,
    width: 2,
    backgroundColor: driverTheme.colors.borderStrong
  },
  supportBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  supportBadge: {
    backgroundColor: '#eef4f8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#d8e2ea'
  },
  supportBadgeAnimal: {
    backgroundColor: '#fff2cc',
    borderColor: '#f3d26b'
  },
  supportBadgeWillCall: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626'
  },
  supportBadgeText: {
    color: '#334a59',
    fontSize: 11,
    fontWeight: '700'
  },
  supportBadgeWillCallText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800'
  },
  supportBadgeAnimalText: {
    color: '#6f4e00',
    fontSize: 11,
    fontWeight: '800'
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionSoft: {
    backgroundColor: driverTheme.colors.primarySoft,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  actionSoftText: {
    color: driverTheme.colors.primaryText,
    fontWeight: '800'
  },
  actionDark: {
    backgroundColor: driverTheme.colors.primary,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 13
  },
  actionDarkText: {
    color: driverTheme.colors.white,
    fontWeight: '800'
  },
  actionDisabled: {
    opacity: 0.65
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  infoPanel: {
    width: '48%',
    backgroundColor: driverTheme.colors.surfaceMuted,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: driverTheme.colors.border
  },
  infoLabel: {
    color: driverTheme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  infoValue: {
    color: driverTheme.colors.text,
    marginTop: 6,
    fontWeight: '800'
  },
  escalationCard: {
    backgroundColor: driverTheme.colors.danger,
    borderColor: '#6b3946'
  }
});