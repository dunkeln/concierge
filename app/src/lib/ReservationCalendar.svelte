<script lang="ts">
	import { onMount } from 'svelte';
	import CalendarView, { type CalendarViewMode } from '$lib/CalendarView.svelte';
	import { isFresh, RESERVATION_TTL_MS } from '$lib/freshness';
	type Inspection = {
		venue: string;
		date: string;
		partySize: number;
		times: string[];
		timeGroups?: { requested: string[]; nearby: string[] };
		experiences?: { name: string; times: string[] }[];
		complete: boolean;
		checkedAt: string | null;
		status: string;
		calendarView?: CalendarViewMode;
	};
	let {
		inspection,
		googleEnabled,
		calendarConnected,
		selectedTime,
		selectedExperience,
		disabled = false,
		onSelectDate,
		onSelectTime
	}: {
		inspection: Inspection;
		googleEnabled: boolean;
		calendarConnected: boolean;
		selectedTime: string | null;
		selectedExperience?: string | null;
		disabled?: boolean;
		onSelectDate: (date: string) => void;
		onSelectTime: (time: string, experience?: string) => void;
	} = $props();
	let now = $state(Date.now());
	let expired = $derived(!isFresh(inspection.checkedAt, RESERVATION_TTL_MS, now));
	onMount(() => {
		const remaining = Date.parse(inspection.checkedAt ?? '') + RESERVATION_TTL_MS - Date.now();
		if (remaining <= 0) {
			now = Date.now();
			return;
		}
		const timer = setTimeout(() => (now = Date.now()), remaining);
		return () => clearTimeout(timer);
	});
	const minutes = (time: string) => {
		const [, h, m, p] = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(time) ?? [];
		return h ? ((Number(h) % 12) + (p === 'PM' ? 12 : 0)) * 60 + Number(m) : 0;
	};
	let choices = $derived(
		inspection.times
			.toSorted((a, b) => minutes(a) - minutes(b))
			.flatMap((time) => {
				const matching = inspection.experiences?.filter((item) => item.times.includes(time)) ?? [];
				const label = inspection.timeGroups?.nearby.includes(time) ? `${time} · Nearby` : time;
				return matching.length > 1
					? matching.map((item) => ({
							time,
							experience: item.name || undefined,
							label: `${label} · ${item.name}`
						}))
					: [{ time, experience: matching[0]?.name || undefined, label }];
			})
	);
</script>

<section
	class="w-full max-w-md rounded-2xl bg-secondary p-2 text-sm"
	aria-label="Reservation calendar"
>
	<div class="flex items-center justify-between gap-2 px-2 py-2">
		<div>
			<p class="font-medium">{inspection.venue}</p>
			<p class="text-xs text-primary-foreground/55">{inspection.partySize} guests</p>
		</div>
		{#if inspection.checkedAt}<span class="text-right text-[11px] text-primary-foreground/50"
				>Checked {new Date(inspection.checkedAt).toLocaleString()}</span
			>{/if}
	</div>
	<CalendarView
		initialView={inspection.calendarView ?? 'time'}
		initialDate={inspection.date}
		verifiedDate={inspection.date}
		choices={expired ? [] : choices}
		{selectedTime}
		{selectedExperience}
		{calendarConnected}
		{googleEnabled}
		{disabled}
		onCommitDate={onSelectDate}
		onCommitTime={onSelectTime}
	/>
	{#if expired && inspection.times.length}<div
			class="flex items-center justify-between gap-2 px-2 pt-2 text-xs text-primary-foreground/60"
		>
			<span>Times need a fresh check.</span>
			<button
				type="button"
				class="underline underline-offset-4 disabled:opacity-50"
				{disabled}
				onclick={() => onSelectDate(inspection.date)}>Check again</button
			>
		</div>{/if}
	{#if !inspection.times.length}<p class="px-2 pt-2 text-xs text-primary-foreground/60">
			{inspection.status}
		</p>{/if}
	{#if !inspection.complete}<p class="px-2 pt-1 text-xs text-primary-foreground/50">
			Partial result · times can change
		</p>{/if}
	{#if calendarConnected && inspection.times.length}<p
			class="px-2 pt-1 text-xs text-primary-foreground/50"
		>
			Calendar checks assume your device timezone and a two-hour meal.
		</p>{/if}
</section>
