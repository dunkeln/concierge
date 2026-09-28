<script lang="ts">
	import { untrack } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { conflictsWithCalendar } from '$lib/calendar-conflict';
	export type CalendarViewMode = 'month' | 'day' | 'time';
	type Choice = { time: string; experience?: string; label: string };
	let {
		initialView,
		initialDate,
		initialTime = '',
		verifiedDate,
		choices = [],
		selectedTime = null,
		selectedExperience = null,
		calendarConnected,
		googleEnabled,
		disabled = false,
		onCommitDate,
		onCommitTime
	}: {
		initialView: CalendarViewMode;
		initialDate: string;
		initialTime?: string;
		verifiedDate?: string;
		choices?: Choice[];
		selectedTime?: string | null;
		selectedExperience?: string | null;
		calendarConnected: boolean;
		googleEnabled: boolean;
		disabled?: boolean;
		onCommitDate: (date: string) => void;
		onCommitTime: (time: string, experience?: string, date?: string) => void;
	} = $props();
	const view = $derived(initialView);
	let date = $state(untrack(() => initialDate));
	let time = $state(untrack(() => initialTime));
	$effect(() => {
		date = initialDate;
	});
	$effect(() => {
		time = initialTime;
	});
	let busy = $state<{ start: string; end: string }[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let complete = $state(false);
	let count = $state(0);
	const month = $derived(date.slice(0, 7));
	const start = $derived(new Date(`${month}-01T00:00:00Z`));
	const dayCount = $derived(
		new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
	);
	const cells = $derived(
		Array.from({ length: start.getUTCDay() + dayCount }, (_, i) => i - start.getUTCDay() + 1)
	);
	const localDate = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const year = $derived(Number(month.slice(0, 4)));
	const title = $derived(
		new Intl.DateTimeFormat(
			undefined,
			view === 'month' || view === 'day'
				? { month: 'long', year: 'numeric' }
				: { weekday: 'long', month: 'long', day: 'numeric' }
		).format(new Date(`${date}T12:00:00`))
	);
	const visibleChoices = $derived(date === verifiedDate ? choices : []);
	const overlapsDay = (slot: { start: string; end: string }, day: string) => {
		const start = new Date(`${day}T00:00:00`);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		return Date.parse(slot.start) < end.getTime() && Date.parse(slot.end) > start.getTime();
	};
	const dayBusy = $derived(busy.filter((slot) => overlapsDay(slot, date)));
	const busyOn = (day: string) => busy.some((slot) => overlapsDay(slot, day));
	const inputTime = $derived.by(() => {
		const [hour, minute] = time.split(':').map(Number);
		return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
	});
	$effect(() => {
		if (!calendarConnected) return;
		const controller = new AbortController();
		loading = true;
		failed = false;
		busy = [];
		fetch(`/api/calendar/busy?month=${encodeURIComponent(month)}`, { signal: controller.signal })
			.then(async (r) => {
				if (!r.ok) throw new Error('Calendar unavailable');
				return r.json();
			})
			.then(
				(result: {
					busy: { start: string; end: string }[];
					complete: boolean;
					calendarCount: number;
				}) => {
					busy = result.busy;
					complete = result.complete;
					count = result.calendarCount;
					loading = false;
				}
			)
			.catch(() => {
				if (!controller.signal.aborted) {
					failed = true;
					loading = false;
				}
			});
		return () => controller.abort();
	});
	function move(amount: number) {
		const current = new Date(`${date}T12:00:00`);
		if (view === 'month') current.setFullYear(current.getFullYear() + amount);
		else if (view === 'day') current.setMonth(current.getMonth() + amount, 1);
		else current.setDate(current.getDate() + amount);
		date = localDate(current);
	}
	function chooseTime() {
		const [h, m] = time.split(':').map(Number);
		if (time && Number.isInteger(h) && h >= 0 && h < 24 && Number.isInteger(m) && m >= 0 && m < 60)
			onCommitTime(inputTime, undefined, date);
	}
</script>

<div class="min-w-0 rounded-3xl bg-secondary/65 p-4 text-primary-foreground sm:p-5">
	<div class="flex items-center justify-between gap-2">
		<strong
			class={view === 'time'
				? 'text-sm font-medium text-primary-foreground/60'
				: 'text-base font-semibold tracking-tight'}>{view === 'month' ? year : title}</strong
		>
		{#if view !== 'time'}<div class="flex gap-1">
				<button
					type="button"
					{disabled}
					aria-label="Previous {view === 'month' ? 'year' : view === 'day' ? 'month' : 'day'}"
					class="grid size-11 place-items-center rounded-xl hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
					onclick={() => move(-1)}><ChevronLeft size={18} strokeWidth={1.5} /></button
				><button
					type="button"
					{disabled}
					aria-label="Next {view === 'month' ? 'year' : view === 'day' ? 'month' : 'day'}"
					class="grid size-11 place-items-center rounded-xl hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
					onclick={() => move(1)}><ChevronRight size={18} strokeWidth={1.5} /></button
				>
			</div>{/if}
	</div>
	{#if view === 'month'}
		<div class="mt-3 grid grid-cols-3 gap-2" aria-label="Choose month">
			{#each Array.from({ length: 12 }, (_, index) => index) as index}
				{@const candidate = `${year}-${String(index + 1).padStart(2, '0')}`}
				<button
					type="button"
					{disabled}
					aria-label={new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
						new Date(year, index, 1)
					)}
					class="min-h-14 rounded-2xl text-sm font-medium hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96] disabled:opacity-50"
					onclick={() => onCommitDate(candidate)}
					>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(
						new Date(year, index, 1)
					)}</button
				>
			{/each}
		</div>
	{:else if view === 'day'}
		<div class="mt-2 grid grid-cols-7 gap-y-1 text-center text-xs" aria-label="{title} calendar">
			{#each ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as weekday}
				<span class="py-2 text-primary-foreground/50">{weekday}</span>
			{/each}
			{#each cells as day, index (index)}
				{#if day > 0}
					{@const candidate = `${month}-${String(day).padStart(2, '0')}`}
					<button
						type="button"
						{disabled}
						aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
							new Date(`${candidate}T12:00:00`)
						)}
						aria-pressed={date === candidate}
						class="relative mx-auto flex min-h-11 w-full max-w-11 flex-col items-center justify-center rounded-full text-sm tabular-nums hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96] disabled:opacity-50 aria-pressed:bg-primary-foreground aria-pressed:text-primary"
						onclick={() => {
							date = candidate;
							onCommitDate(candidate);
						}}
					>
						{day}<span
							class="absolute bottom-1 size-1 rounded-full"
							class:bg-primary-foreground={calendarConnected && !loading && busyOn(candidate)}
							class:bg-current={candidate === verifiedDate}
						></span>
					</button>
				{:else}<span></span>{/if}
			{/each}
		</div>
	{:else}
		{#if calendarConnected && !loading && !failed && dayBusy.length}
			<div class="mb-3 space-y-1" aria-label="Calendar conflicts">
				{#each dayBusy as slot}
					<p class="rounded-lg bg-secondary px-3 py-2 text-xs text-primary-foreground/70">
						Busy · {new Date(slot.start).toLocaleTimeString([], {
							hour: 'numeric',
							minute: '2-digit'
						})}–{new Date(slot.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
					</p>
				{/each}
			</div>
		{/if}
		{#if visibleChoices.length}<div
				class="mt-3 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto"
				aria-label="Verified reservation times"
			>
				{#each visibleChoices as choice (`${choice.time}-${choice.experience ?? ''}`)}<button
						type="button"
						aria-pressed={selectedTime === choice.time &&
							selectedExperience === (choice.experience ?? null)}
						{disabled}
						class="min-h-11 rounded-2xl bg-primary-foreground/8 px-4 text-sm font-medium tabular-nums hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96] disabled:opacity-50 aria-pressed:bg-primary-foreground aria-pressed:text-primary"
						onclick={() => onCommitTime(choice.time, choice.experience, date)}
						>{choice.label}{calendarConnected && !loading && !failed
							? conflictsWithCalendar(date, choice.time, busy)
								? ' · Busy'
								: complete
									? ' · No conflict'
									: ' · Check incomplete'
							: ''}</button
					>{/each}
			</div>
		{:else if verifiedDate}<p class="text-sm text-primary-foreground/60">
				No checked times to choose yet.
			</p>
		{:else}<form
				class="mt-4 space-y-4"
				onsubmit={(event) => {
					event.preventDefault();
					if (!disabled) chooseTime();
				}}
			>
				<input
					aria-label="Time"
					type="time"
					bind:value={time}
					{disabled}
					required
					class="calendar-time min-h-20 w-full min-w-0 rounded-2xl bg-primary/30 px-4 text-center text-4xl font-medium tracking-tight text-primary-foreground tabular-nums focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
				/>
				<button
					type="submit"
					disabled={disabled || !time}
					class="min-h-11 w-full rounded-2xl bg-primary-foreground px-4 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.96] disabled:opacity-40"
					>Use time</button
				>
			</form>{/if}
		{#if !verifiedDate && time && calendarConnected && !loading && !failed && conflictsWithCalendar(date, inputTime, busy)}<p
				class="mt-2 text-xs text-primary-foreground/70"
			>
				This time overlaps your calendar in the following two hours.
			</p>{/if}
	{/if}
	{#if calendarConnected}<p class="mt-3 text-xs text-primary-foreground/55" role="status">
			{loading
				? 'Checking calendar…'
				: failed
					? 'Calendar unavailable'
					: `${count} calendars checked${complete ? '' : ' · incomplete'}`}
		</p>
		{#if failed && googleEnabled}<form method="post" action="/?/connectCalendar">
				<button type="submit" class="mt-1 text-xs underline">Reconnect Google Calendar</button>
			</form>{/if}
	{:else if googleEnabled}<form method="post" action="/?/connectCalendar" class="mt-3">
			<button type="submit" class="text-xs underline underline-offset-4"
				>Connect Google Calendar</button
			>
		</form>{/if}
</div>

<style>
	.calendar-time::-webkit-calendar-picker-indicator {
		opacity: 0.6;
		width: 20px;
		height: 20px;
	}
	.calendar-time::-webkit-datetime-edit {
		padding: 12px 0;
	}
</style>
