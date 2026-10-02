import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, Screen, Segmented } from '@/components/ui';
import { aiEnabled } from '@/lib/config';
import { useHistory, useSettings, type Sensitivity } from '@/lib/store';
import { colors, space, type } from '@/lib/theme';

function Row({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Text style={type.heading}>{title}</Text>
        {detail ? <Text style={[type.small, { marginTop: 2 }]}>{detail}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export default function Settings() {
  const s = useSettings();
  const clearHistory = useHistory((h) => h.clear);
  const count = useHistory((h) => h.shoots.length);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxl * 2 }}>
        <View style={styles.header}>
          <Text style={type.hero}>Settings</Text>
          <Pressable accessibilityLabel="Close" onPress={() => router.back()} hitSlop={12}>
            <Text style={{ color: colors.muted, fontSize: 20 }}>✕</Text>
          </Pressable>
        </View>

        <Card>
          <Row title="Voice coaching" detail="Speaks hints so you can pose without looking at the screen">
            <Switch value={s.voice} onValueChange={(voice) => s.update({ voice })} trackColor={{ true: colors.accent }} />
          </Row>
          <Row title="Auto-capture" detail="Takes the photo when you match the pose">
            <Switch value={s.autoCapture} onValueChange={(autoCapture) => s.update({ autoCapture })} trackColor={{ true: colors.accent }} />
          </Row>
          <Text style={[type.heading, { marginTop: space.lg, marginBottom: space.sm }]}>Self-timer</Text>
          <Segmented
            options={[
              { value: 0 as const, label: 'Off' },
              { value: 3 as const, label: '3s' },
              { value: 5 as const, label: '5s' },
              { value: 10 as const, label: '10s' },
            ]}
            value={s.timerSeconds}
            onChange={(timerSeconds) => s.update({ timerSeconds })}
          />
          <Text style={[type.heading, { marginTop: space.lg, marginBottom: space.sm }]}>Match strictness</Text>
          <Segmented<Sensitivity>
            options={[
              { value: 'relaxed', label: 'Relaxed' },
              { value: 'normal', label: 'Normal' },
              { value: 'strict', label: 'Strict' },
            ]}
            value={s.sensitivity}
            onChange={(sensitivity) => s.update({ sensitivity })}
          />
          <Text style={[type.heading, { marginTop: space.lg, marginBottom: space.sm }]}>Start with</Text>
          <Segmented
            options={[
              { value: 'back' as const, label: 'Back camera' },
              { value: 'front' as const, label: 'Selfie camera' },
            ]}
            value={s.defaultCamera}
            onChange={(defaultCamera) => s.update({ defaultCamera })}
          />
        </Card>

        <Card style={{ marginTop: space.lg }}>
          <Text style={type.heading}>Privacy</Text>
          <Text style={[type.body, { color: colors.muted, marginTop: space.sm }]}>
            Pose tracking runs entirely on your phone; the live camera never leaves the device.
            {aiEnabled
              ? ' For AI suggestions and captions, one small, low-resolution image is sent to our server and processed by our AI provider. It is not stored by us.'
              : ' AI features are off in this build, so nothing is uploaded.'}
          </Text>
        </Card>

        <Button title={`My shoots (${count})`} variant="secondary" onPress={() => router.push('/history')} style={{ marginTop: space.lg }} />
        <Button
          title={`Clear saved shoots (${count})`}
          variant="secondary"
          disabled={count === 0}
          onPress={() =>
            Alert.alert('Clear all shoots?', 'Photos in your gallery are not affected.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clearHistory },
            ])
          }
          style={{ marginTop: space.lg }}
        />
        <Button title="Replay intro" variant="ghost" onPress={() => s.update({ onboarded: false })} style={{ marginTop: space.sm }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
});
