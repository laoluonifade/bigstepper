import { countryName, flag } from '@jump/shared/countries';
import { PRIZE_KIND, type PrizeDraft } from '@jump/shared/prizes';
import type { ClubPrize, ClubPrizeTerms, PrizeKind } from '@jump/shared/types';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { pickPhoto, uploadPhoto } from '@/lib/upload';
import { colors, fontFamily, radius, wideLabel } from '@/lib/theme';
import { CameraIcon, CloseIcon, PlusIcon, TrashIcon } from './icons';
import { CountryPicker, SelectField } from './pickers';
import { ErrorNotice, FieldLabel, haptic, Hint, SectionTitle, TextField, Txt } from './ui';

/** A list of countries: chips with a picker to add one. Empty can mean "everyone" (see `emptyLabel`). */
export function CountriesField({ value, onChange, label, hint, emptyLabel }: { value: string[]; onChange: (next: string[]) => void; label: string; hint?: string; emptyLabel?: string }) {
  return <View>
    <FieldLabel label={label} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {value.length === 0 && emptyLabel ? <View style={[styles.chip, { backgroundColor: colors.inkWash, borderColor: 'transparent' }]}><Txt size={13} weight="semibold" color="ink2">{emptyLabel}</Txt></View> : null}
      {value.map((code) => <View key={code} style={styles.chip}>
        <Text style={{ fontSize: 15 }}>{flag(code)}</Text>
        <Txt size={13} weight="semibold">{countryName(code)}</Txt>
        <Pressable onPress={() => onChange(value.filter((item) => item !== code))} hitSlop={6} accessibilityLabel={`Remove ${countryName(code)}`} style={styles.chipClose}><CloseIcon size={12} color={colors.ink3} /></Pressable>
      </View>)}
    </View>
    <View style={{ marginTop: 8 }}>
      <CountryPicker value="" placeholder="Add a country" onChange={(code) => { if (!value.includes(code)) onChange([...value, code]); }} />
    </View>
    {hint ? <Hint>{hint}</Hint> : null}
  </View>;
}

/**
 * The club's prizes for a competition: tiers (each for one or more winners), how winners are chosen,
 * where prizes can go, who delivers, and the claim terms.
 */
export function PrizeEditor({ clubSlug, value, onChange }: { clubSlug: string; value: PrizeDraft; onChange: (next: PrizeDraft) => void }) {
  const set = <K extends keyof PrizeDraft>(key: K, next: PrizeDraft[K]) => onChange({ ...value, [key]: next });
  const setPrize = (index: number, next: Partial<ClubPrize>) => set('prizes', value.prizes.map((prize, i) => (i === index ? { ...prize, ...next } : prize)));
  let place = 1;
  return <View style={{ gap: 20 }}>
    <View style={{ gap: 12 }}>
      {value.prizes.map((prize, index) => {
        const from = place;
        place += Math.max(1, prize.quantity || 1);
        const range = prize.quantity > 1 ? `${from}–${from + prize.quantity - 1}` : `${from}`;
        return <View key={index} style={styles.prize}>
          <View style={styles.prizeHead}>
            <Text style={wideLabel(12, 0.08)}>{value.selection === 'draw' ? `Prize ${index + 1}` : `${prize.quantity > 1 ? 'Places' : 'Place'} ${range}`}</Text>
            {value.prizes.length > 1 && <Pressable onPress={() => set('prizes', value.prizes.filter((_, i) => i !== index))} hitSlop={6} accessibilityLabel="Remove prize" style={styles.iconRound}><TrashIcon size={15} color={colors.ink3} /></Pressable>}
          </View>
          <View style={{ padding: 16, gap: 14 }}>
            <View style={styles.kinds} accessibilityRole="radiogroup" accessibilityLabel="Kind of prize">
              {(Object.keys(PRIZE_KIND) as PrizeKind[]).map((kind) => <Pressable key={kind} onPress={() => { haptic(); setPrize(index, { kind }); }} accessibilityRole="radio" accessibilityState={{ checked: prize.kind === kind }}
                style={[styles.kind, prize.kind === kind && styles.kindActive]}>
                <Txt size={13} weight="bold" color={prize.kind === kind ? 'ink' : 'ink2'}>{PRIZE_KIND[kind].label}</Txt>
              </Pressable>)}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <PrizePhoto clubSlug={clubSlug} url={prize.imageUrl ?? null} onChange={(imageUrl) => setPrize(index, { imageUrl })} />
              <TextField containerStyle={{ flex: 1 }} label="What they win" maxLength={120} value={prize.productName} onChangeText={(productName) => setPrize(index, { productName })}
                placeholder={prize.kind === 'discount' ? '30% off any order' : prize.kind === 'experience' ? 'Session with our coach' : 'Running shoes'} />
            </View>
            <Txt size={12} color="ink3" leading={1.35} style={{ marginTop: -6 }}>{PRIZE_KIND[prize.kind].hint}</Txt>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel label="Winners" />
                <View style={styles.stepper}>
                  <Pressable disabled={prize.quantity <= 1} onPress={() => setPrize(index, { quantity: Math.max(1, prize.quantity - 1) })} style={[styles.step, prize.quantity <= 1 && { opacity: 0.3 }]} accessibilityLabel="Fewer winners"><Txt size={20} weight="bold" color="ink2">−</Txt></Pressable>
                  <TextInput value={prize.quantity ? String(prize.quantity) : ''} keyboardType="number-pad" accessibilityLabel="Number of winners" style={styles.stepValue}
                    onChangeText={(text) => setPrize(index, { quantity: Math.min(1000, Math.max(0, Math.floor(Number(text.replace(/\D/g, '')) || 0))) })} />
                  <Pressable onPress={() => setPrize(index, { quantity: Math.min(1000, prize.quantity + 1) })} style={styles.step} accessibilityLabel="More winners"><Txt size={20} weight="bold" color="ink2">+</Txt></Pressable>
                </View>
              </View>
              <TextField containerStyle={{ flex: 1 }} label="Value" keyboardType="number-pad" placeholder="Optional" left={<Txt size={15} weight="bold" color="ink2">₦</Txt>}
                value={prize.estimatedValue ? prize.estimatedValue.toLocaleString('en-NG') : ''}
                onChangeText={(text) => { const digits = text.replace(/\D/g, ''); setPrize(index, { estimatedValue: digits ? Math.min(100_000_000, Number(digits)) : null, currency: 'NGN' }); }} />
            </View>
            <PrizeExtra title="Details" label="details" value={prize.description ?? ''} placeholder="Size, colour, what’s included" max={600} onChange={(description) => setPrize(index, { description })} />
            {prize.kind !== 'product' && <PrizeExtra title="How to redeem" label="how to redeem" value={prize.redeemInstructions ?? ''} max={600} onChange={(redeemInstructions) => setPrize(index, { redeemInstructions })}
              hint="Only winners see this, after they claim." placeholder={prize.kind === 'discount' ? 'Use code JUMPWIN30 at checkout before 31 Dec.' : 'We’ll call you to book a date.'} />}
          </View>
        </View>;
      })}
    </View>
    {value.prizes.length < 20 && <Pressable onPress={() => set('prizes', [...value.prizes, { position: value.prizes.length + 1, kind: 'product', productName: '', quantity: 1 }])} style={({ pressed }) => [styles.addPrize, pressed && { borderColor: colors.ink }]} accessibilityRole="button">
      <PlusIcon size={16} color={colors.ink2} /><Txt size={14} weight="bold" color="ink2">Add another prize</Txt>
    </Pressable>}

    <Text style={[wideLabel(12, 0.08), { color: colors.ink2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 20 }]}>Prize rules</Text>
    <View>
      <FieldLabel label="How winners are chosen" />
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {([['top', 'Top finishers', 'Prizes go down the final leaderboard, in order.'], ['draw', 'Random draw', 'Everyone who qualifies has an equal chance. The draw is recorded.']] as const).map(([option, title, body]) => {
          const active = value.selection === option;
          return <Pressable key={option} onPress={() => { haptic(); set('selection', option); }} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[styles.choice, active && { borderColor: colors.ink, backgroundColor: colors.ink }]}>
            <Txt size={13} weight="bold" color={active ? 'paper' : 'ink'}>{title}</Txt>
            <Txt size={12} leading={1.35} style={{ marginTop: 2, color: active ? colors.onInkMuted : colors.ink2 }}>{body}</Txt>
          </Pressable>;
        })}
      </View>
      <Hint>Winners must have scored, met the minimums and live where you deliver. Your club’s managers can’t win.</Hint>
    </View>
    <CountriesField label="Where you can deliver prizes" value={value.deliveryCountries} onChange={(next) => set('deliveryCountries', next)} hint="Only people living in these countries can win." />
    <SelectField label="Who delivers" value={value.fulfilment} onChange={(next) => set('fulfilment', next)} options={[{ value: 'club', label: 'Our club' }, { value: 'jump', label: 'Jump (agreed with us)' }]} />
    <SelectField label="Who pays delivery" value={value.shipping} onChange={(next) => set('shipping', next)} options={[{ value: 'club', label: 'Our club' }, { value: 'jump', label: 'Jump' }, { value: 'other', label: 'Other (explain below)' }]} />
    <TextField label="Fulfilment terms" optional hint="How long delivery takes, collection options, anything winners should know." multiline maxLength={300} value={value.shippingNote} onChangeText={(next) => set('shippingNote', next)}
      placeholder="Delivered within 10 working days of claiming. Lagos winners can collect from our store." style={{ minHeight: 64 }} />
    <PrizeExtra title="Eligibility notes" label="eligibility notes" value={value.eligibilityNote} max={600} onChange={(next) => set('eligibilityNote', next)} placeholder="18+ only. One prize per person." />
    <TextField label="Days to claim" hint="Unclaimed prizes pass to the next eligible finisher." keyboardType="number-pad" containerStyle={{ maxWidth: 140 }} value={String(value.claimDays)}
      onChangeText={(text) => set('claimDays', Math.min(60, Math.max(3, Math.floor(Number(text.replace(/\D/g, '')) || 14))))} />
  </View>;
}

/** An optional text, behind a link until it's wanted, so each prize stays short on a phone. */
function PrizeExtra({ title, label, value, onChange, placeholder, hint, max }: { title: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; hint?: string; max: number }) {
  const [open, setOpen] = useState(Boolean(value));
  if (!open) return <Pressable onPress={() => setOpen(true)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }} accessibilityRole="button">
    <PlusIcon size={13} color={colors.ink2} /><Txt size={13} weight="semibold" color="ink2">Add {label}</Txt>
  </Pressable>;
  return <TextField label={title} hint={hint} multiline maxLength={max} value={value} onChangeText={onChange} placeholder={placeholder} autoFocus={!value} style={{ minHeight: 64 }} />;
}

function PrizePhoto({ clubSlug, url, onChange }: { clubSlug: string; url: string | null; onChange: (url: string | null) => void }) {
  const upload = useMutation({
    mutationFn: async () => {
      const photo = await pickPhoto();
      return photo ? uploadPhoto<{ url: string }>(`/clubs/${clubSlug}/prize-images`, photo, { name: 'prize.jpg' }) : null;
    },
    onSuccess: (result) => result && onChange(result.url),
  });
  return <View style={{ marginTop: 22 }}>
    <Pressable onPress={() => upload.mutate()} disabled={upload.isPending} style={styles.photo} accessibilityLabel={url ? 'Change prize photo' : 'Add a prize photo'}>
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : upload.isPending ? <ActivityIndicator color={colors.ink} /> : <CameraIcon size={18} color={colors.ink3} />}
    </Pressable>
    {url ? <Pressable onPress={() => onChange(null)} hitSlop={4}><Txt size={11} weight="semibold" color="ink3" align="center" style={{ marginTop: 2 }}>Remove</Txt></Pressable> : null}
    <ErrorNotice error={upload.error} />
  </View>;
}

/** On a competition's page: what can be won, how winners are chosen, and the terms. */
export function PrizeTerms({ terms, clubName }: { terms: ClubPrizeTerms; clubName?: string }) {
  let place = 1;
  const lines = [
    terms.selection === 'draw' ? 'Winners are drawn at random from everyone who qualifies, once the competition ends. The draw is recorded so it can be checked.' : 'Prizes go down the final leaderboard to people who qualify.',
    `Open to people living in ${terms.deliveryCountries.map(countryName).join(', ')}. The club’s managers can’t win.`,
    `Winners have ${terms.claimDays} days to claim, or the prize passes to the next eligible finisher. ${terms.fulfilment === 'jump' ? 'Jump delivers the prizes.' : 'The club delivers the prizes.'} ${terms.shipping === 'club' ? 'The club pays delivery.' : terms.shipping === 'jump' ? 'Jump pays delivery.' : ''}`,
    ...(terms.shippingNote ? [terms.shippingNote] : []),
    ...(terms.eligibilityNote ? [terms.eligibilityNote] : []),
  ];
  return <View>
    <SectionTitle aside={clubName ? <Txt size={12} color="ink3">From {clubName}</Txt> : undefined}>Prizes</SectionTitle>
    <View style={{ gap: 12 }}>
      {terms.prizes.map((prize) => {
        const from = place;
        place += prize.quantity;
        return <View key={prize.position} style={styles.term}>
          {prize.imageUrl ? <Image source={{ uri: prize.imageUrl }} style={styles.termArt} contentFit="cover" /> : <View style={[styles.termArt, { backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' }]}><Txt size={22} weight="black">{terms.selection === 'draw' ? '★' : String(from)}</Txt></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt size={11} weight="extrabold" upper tracking={0.08} color="ink3">{`${terms.selection === 'draw' ? `${prize.quantity} ${prize.quantity === 1 ? 'winner' : 'winners'} by draw` : prize.quantity > 1 ? `Places ${from}–${from + prize.quantity - 1}` : `Place ${from}`} · ${PRIZE_KIND[prize.kind].label}`}</Txt>
            <Txt size={15} weight="bold" leading={1.3}>{prize.productName}</Txt>
            {prize.description ? <Txt size={12} color="ink2" numberOfLines={2} style={{ marginTop: 2 }}>{prize.description}</Txt> : null}
            {prize.estimatedValue ? <Txt size={12} color="ink3" num style={{ marginTop: 2 }}>Worth about ₦{prize.estimatedValue.toLocaleString('en-NG')}</Txt> : null}
          </View>
        </View>;
      })}
    </View>
    {terms.winners.length > 0 && <View style={styles.winners}>
      <Txt size={12} weight="extrabold" upper tracking={0.08} color="ok">Winners</Txt>
      {terms.winners.map((winner, index) => <Txt key={index} size={14} style={{ marginTop: 2 }}><Txt size={14} weight="bold">{winner.displayName}</Txt> · {winner.productName}</Txt>)}
    </View>}
    <View style={{ marginTop: 16, gap: 6 }}>{lines.map((line) => <Txt key={line} size={13} color="ink2" leading={1.5}>{line}</Txt>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, paddingLeft: 10, paddingRight: 4 },
  chipClose: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  prize: { borderRadius: radius['2xl'], borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, overflow: 'hidden' },
  prizeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: 'rgba(18,18,18,0.03)', paddingHorizontal: 16, paddingVertical: 10, minHeight: 44 },
  iconRound: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  kinds: { flexDirection: 'row', borderRadius: radius.xl, backgroundColor: colors.inkWash, padding: 4 },
  kind: { flex: 1, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  kindActive: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: radius.base, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.white },
  step: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, textAlign: 'center', fontFamily: fontFamily('bold'), fontSize: 16, color: colors.ink, fontVariant: ['tabular-nums'] },
  addPrize: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: radius['2xl'], borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.4)' },
  choice: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, padding: 12 },
  photo: { width: 50, height: 50, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(18,18,18,0.4)', backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  term: { flexDirection: 'row', gap: 12, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.card, padding: 12 },
  termArt: { width: 64, height: 64, borderRadius: radius.lg },
  winners: { marginTop: 16, borderRadius: radius.xl, backgroundColor: colors.okWash, padding: 12 },
});
