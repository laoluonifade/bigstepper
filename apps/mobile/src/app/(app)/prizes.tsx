import { countryName } from '@jump/shared/countries';
import { formatDate } from '@jump/shared/format';
import { PRIZE_KIND } from '@jump/shared/prizes';
import type { AwardStatus, MyPrize } from '@jump/shared/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CheckIcon } from '@/components/icons';
import { CountryPicker, PhoneField } from '@/components/pickers';
import { Button, EmptyState, ErrorNotice, haptic, HardShadow, Hint, Notice, PageHeader, Screen, Skeleton, TextField, Txt } from '@/components/ui';
import { api, post } from '@/lib/api';
import { colors, radius } from '@/lib/theme';
import { toast } from '@/lib/toast';

const STATUS: Record<AwardStatus, { label: string; bg: string; fg: string }> = {
  AWAITING_DETAILS: { label: 'Claim it', bg: colors.track, fg: colors.white },
  DETAILS_SUBMITTED: { label: 'Claimed', bg: colors.ink, fg: colors.paper },
  READY_FOR_DISPATCH: { label: 'Being prepared', bg: colors.ink, fg: colors.paper },
  SHIPPED: { label: 'On its way', bg: colors.volt, fg: colors.ink },
  DELIVERED: { label: 'Delivered', bg: colors.ok, fg: colors.white },
  FORFEITED: { label: 'Passed on', bg: colors.inkFaint, fg: colors.ink2 },
  ISSUE: { label: 'Needs attention', bg: colors.bad, fg: colors.white },
};

/** Prizes you've won from club competitions: claim them, then follow them to your door. */
export default function PrizesScreen() {
  const prizes = useQuery({ queryKey: ['prizes', 'mine'], queryFn: () => api<MyPrize[]>('/prizes/mine') });
  const list = prizes.data ?? [];
  return <Screen refreshing={prizes.isRefetching} onRefresh={() => void prizes.refetch()}>
    <Stack.Screen options={{ title: 'Prizes' }} />
    <PageHeader eyebrow="You" title="Prizes" description="Products, discounts and experiences you’ve won in club competitions." />
    <ErrorNotice error={prizes.error} onRetry={() => void prizes.refetch()} />
    {prizes.isLoading ? <Skeleton style={{ height: 160, borderRadius: radius['2xl'] }} />
      : !list.length ? <EmptyState mark="★" title="No prizes yet" action={<Button size="sm" title="Find club competitions" onPress={() => router.push('/clubs')} />}>Clubs put up prizes for their competitions. Finish near the top, or get lucky in a draw.</EmptyState>
        : <View style={{ gap: 16 }}>{list.map((prize) => <PrizeCard key={prize.id} prize={prize} />)}</View>}
  </Screen>;
}

function PrizeCard({ prize }: { prize: MyPrize }) {
  const status = STATUS[prize.status];
  const [editing, setEditing] = useState(false);
  const claimable = prize.status === 'AWAITING_DETAILS' || (prize.status === 'DETAILS_SUBMITTED' && editing);
  const body = <View style={[styles.card, { borderColor: prize.status === 'AWAITING_DETAILS' ? colors.ink : colors.line }]}>
    <View style={{ flexDirection: 'row', gap: 16, padding: 16 }}>
      {prize.imageUrl ? <Image source={{ uri: prize.imageUrl }} style={styles.art} contentFit="cover" /> : <View style={[styles.art, { backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' }]}><Txt size={30} weight="black">★</Txt></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={[styles.status, { backgroundColor: status.bg }]}><Txt size={11} weight="extrabold" upper tracking={0.06} style={{ color: status.fg }}>{status.label}</Txt></View>
        <Txt size={18} weight="extrabold" leading={1.2} style={{ marginTop: 6 }}>{prize.productName}</Txt>
        <Txt size={13} color="ink2" style={{ marginTop: 2 }}>
          {`${PRIZE_KIND[prize.kind].label} from `}
          <Txt size={13} weight="semibold" onPress={() => router.push(`/clubs/${prize.clubSlug}`)}>{prize.clubName}</Txt>
          {' · '}
          <Txt size={13} color="ink2" onPress={() => router.push(`/competitions/${prize.code}`)} style={{ textDecorationLine: 'underline' }}>{prize.title}</Txt>
        </Txt>
        {prize.description ? <Txt size={13} color="ink2" leading={1.5} style={{ marginTop: 6 }}>{prize.description}</Txt> : null}
      </View>
    </View>
    {prize.status === 'AWAITING_DETAILS' && <View style={styles.due}><Txt size={13} weight="semibold">{`Claim it by ${formatDate(prize.detailsDueAt, { year: 'numeric' })}, or it passes to the next finisher.`}</Txt></View>}
    {claimable && <ClaimForm prize={prize} onDone={() => setEditing(false)} />}
    {!claimable && prize.status !== 'FORFEITED' && prize.status !== 'AWAITING_DETAILS' && <View style={styles.section}>
      {prize.redeemInstructions ? <View style={styles.redeem}>
        <Txt size={11} weight="extrabold" upper tracking={0.08} color="ok">How to redeem</Txt>
        <Txt size={14} selectable style={{ marginTop: 4 }}>{prize.redeemInstructions}</Txt>
      </View> : null}
      {prize.kind === 'product' && prize.address ? <Txt size={13} color="ink2">Delivering to <Txt size={13} weight="bold">{prize.fullName}</Txt>{`, ${prize.address}, ${prize.city}, ${prize.region}, ${prize.country ? countryName(prize.country) : ''}`}</Txt> : null}
      {prize.kind !== 'product' && prize.fullName ? <Txt size={13} color="ink2">Claimed as <Txt size={13} weight="bold">{prize.fullName}</Txt>{prize.phone ? ` · ${prize.phone}` : ''}</Txt> : null}
      {prize.trackingNote ? <Txt size={13} color="ink2">{`Update from ${prize.clubName}: `}<Txt size={13} weight="bold">{prize.trackingNote}</Txt></Txt> : null}
      {prize.shippingNote ? <Txt size={13} color="ink3">{prize.shippingNote}</Txt> : null}
      {prize.status === 'DETAILS_SUBMITTED' && <Pressable onPress={() => setEditing(true)} hitSlop={6}><Txt size={13} weight="semibold" color="ink2" style={{ textDecorationLine: 'underline' }}>Change my details</Txt></Pressable>}
      {prize.status === 'ISSUE' && <Notice tone="warn">The club flagged a problem with this prize. They or Jump will contact you.</Notice>}
    </View>}
    {prize.status === 'FORFEITED' && <View style={styles.section}><Txt size={13} color="ink2">{prize.forfeitReason ?? 'This prize passed to the next finisher.'}</Txt></View>}
  </View>;
  return prize.status === 'AWAITING_DETAILS' ? <HardShadow offset={2} radius={radius['2xl']}>{body}</HardShadow> : body;
}

/** Only what the prize needs: a delivery address for products, a phone for experiences, a name for discounts. */
function ClaimForm({ prize, onDone }: { prize: MyPrize; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(prize.fullName ?? '');
  const [phone, setPhone] = useState(prize.phone ?? '');
  const [address, setAddress] = useState(prize.address ?? '');
  const [city, setCity] = useState(prize.city ?? '');
  const [region, setRegion] = useState(prize.region ?? '');
  const [country, setCountry] = useState(prize.country ?? (prize.deliveryCountries.length === 1 ? prize.deliveryCountries[0] : ''));
  const [notes, setNotes] = useState(prize.deliveryNotes ?? '');
  const product = prize.kind === 'product';
  const needsPhone = prize.kind !== 'discount';
  const claim = useMutation({
    mutationFn: () => post(`/prizes/${prize.id}/details`, {
      fullName: fullName.trim(),
      ...(needsPhone ? { phone } : {}),
      ...(product ? { address: address.trim(), city: city.trim(), region: region.trim(), country } : {}),
      ...(notes.trim() ? { deliveryNotes: notes.trim() } : {}),
    }),
    async onSuccess() {
      haptic('success');
      await queryClient.invalidateQueries({ queryKey: ['prizes'] });
      toast({ tone: 'ok', title: 'Claimed', message: product ? `${prize.clubName} will send it to you.` : 'You can see how to redeem it now.' });
      onDone();
    },
  });
  const outside = product && country && !prize.deliveryCountries.includes(country);
  const ready = fullName.trim().length >= 2 && (!needsPhone || phone.length >= 8) && (!product || (address.trim().length >= 5 && city.trim().length >= 2 && region.trim().length >= 2 && country && !outside));
  return <View style={[styles.section, { gap: 16 }]}>
    <Txt size={13} color="ink2">
      {product ? `Where should ${prize.clubName} send it? Only they${prize.fulfilment === 'jump' ? ' and Jump' : ''} see these details, and only until it’s delivered.` : prize.kind === 'experience' ? `${prize.clubName} will use your phone number to arrange it.` : 'Confirm your name to see how to redeem it.'}
    </Txt>
    <TextField label="Full name" autoComplete="name" textContentType="name" maxLength={120} value={fullName} onChangeText={setFullName} />
    {needsPhone && <PhoneField label="Phone" value={phone} onChange={setPhone} defaultCountry={country || 'NG'} />}
    {product && <>
      <TextField label="Street address" autoComplete="street-address" textContentType="fullStreetAddress" maxLength={300} value={address} onChangeText={setAddress} />
      <TextField label="City" autoComplete="postal-address-locality" textContentType="addressCity" maxLength={80} value={city} onChangeText={setCity} />
      <TextField label="State or region" autoComplete="postal-address-region" textContentType="addressState" maxLength={80} value={region} onChangeText={setRegion} />
      <View>
        <CountryPicker label="Country" value={country} onChange={setCountry} />
        {outside ? <Hint error>{`${prize.clubName} only delivers to ${prize.deliveryCountries.map(countryName).join(', ')}.`}</Hint> : null}
      </View>
    </>}
    <TextField label={product ? 'Delivery notes' : 'Anything the club should know'} optional multiline maxLength={300} value={notes} onChangeText={setNotes} placeholder={product ? 'Landmark, best time to call' : ''} style={{ minHeight: 60 }} />
    <ErrorNotice error={claim.error} />
    <Button full icon={<CheckIcon size={16} />} loading={claim.isPending} disabled={!ready} title={claim.isPending ? 'Sending…' : prize.status === 'DETAILS_SUBMITTED' ? 'Update details' : 'Claim prize'} onPress={() => claim.mutate()} />
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius['2xl'], borderWidth: 1.5, backgroundColor: colors.card, overflow: 'hidden' },
  art: { width: 80, height: 80, borderRadius: radius.xl },
  status: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 2 },
  due: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.trackWash, paddingHorizontal: 16, paddingVertical: 10 },
  section: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingHorizontal: 16, paddingVertical: 14 },
  redeem: { borderRadius: radius.xl, backgroundColor: colors.okWash, padding: 12 },
});
