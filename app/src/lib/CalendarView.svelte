<script lang="ts">
	import { untrack } from 'svelte';
	import { conflictsWithCalendar } from '$lib/calendar-conflict';
	export type CalendarViewMode = 'month' | 'day' | 'time';
	type Choice = { time: string; experience?: string; label: string };
	let {
		initialView,
		initialDate,
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
	let view = $state<CalendarViewMode>(untrack(() => initialView));
	let date = $state(untrack(() => initialDate));
	let time = $state('');
	let busy = $state<{ start: string; end: string }[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let complete = $state(false);
	let count = $state(0);
	let dayScroller = $state<HTMLDivElement>();
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
	const title = $derived(
		new Intl.DateTimeFormat(
			undefined,
			view === 'month'
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
		if (view === 'day' && dayScroller) dayScroller.scrollTop = 8 * 48;
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
		if (view === 'month') current.setMonth(current.getMonth() + amount, 1);
		else current.setDate(current.getDate() + amount);
		date = localDate(current);
	}
	function chooseTime() {
		const [h, m] = time.split(':').map(Number);
		if (time && Number.isInteger(h) && Number.isInteger(m))
			onCommitTime(inputTime, undefined, date);
	}
</script>

<div class="rounded-2xl border border-primary-foreground/15 bg-primary p-3 text-primary-foreground">
	<div class="flex items-center justify-between gap-2">
		<strong class="text-sm font-medium">{title}</strong>
		<div class="flex gap-1">
			<button
				type="button"
				aria-label="Previous {view === 'month' ? 'month' : 'day'}"
				class="grid size-11 place-items-center rounded-xl hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
				onclick={() => move(-1)}>‹</button
			><button
				type="button"
				aria-label="Next {view === 'month' ? 'month' : 'day'}"
				class="grid size-11 place-items-center rounded-xl hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
				onclick={() => move(1)}>›</button
			>
		</div>
	</div>
	<div class="mb-3 flex rounded-xl bg-secondary p-1" role="group" aria-label="Calendar view">
		{#each ['month', 'day', 'time'] as mode}<button
				type="button"
				aria-pressed={view === mode}
				class="min-h-10 flex-1 rounded-lg text-xs font-medium capitalize focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary-foreground/15"
				onclick={() => (view = mode as CalendarViewMode)}>{mode}</button
			>{/each}
	</div>
	{#if view === 'month'}
		<div class="grid grid-cols-7 gap-1 text-center text-xs" aria-label="{title} calendar">
			{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as weekday}<span
					class="py-2 text-primary-foreground/50">{weekday}</span
				>{/each}
			{#each cells as day, index (index)}{#if day > 0}{@const candidate = `${month}-${String(day).padStart(2, '0')}`}<button
						type="button"
						aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(
							new Date(`${candidate}T12:00:00`)
						)}
						aria-pressed={date === candidate}
						class="flex min-h-11 flex-col items-center justify-center rounded-xl text-sm hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary-foreground aria-pressed:text-primary"
						onclick={() => {
							date = candidate;
							view = 'day';
						}}
						>{day}<span
							class="mt-0.5 size-1 rounded-full"
							class:bg-primary-foreground={calendarConnected && !loading && busyOn(candidate)}
							class:bg-current={candidate === verifiedDate}
						></span></button
					>{:else}<span></span>{/if}{/each}
		</div>
	{:else if view === 'day'}
		<div
			class="max-h-72 overflow-y-auto rounded-xl bg-secondary/60"
			aria-label="Daily calendar timeline"
			bind:this={dayScroller}
		>
			<div class="relative h-[1152px]">
				{#each Array.from({ length: 24 }, (_, h) => h) as hour}<div
						class="absolute right-0 left-0 flex h-12 border-t border-primary-foreground/10"
						style={`top:${hour * 48}px`}
					>
						<span class="w-14 shrink-0 px-2 pt-1 text-[10px] text-primary-foreground/50"
							>{new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(
								new Date(2020, 0, 1, hour)
							)}</span
						>
					</div>{/each}
				{#each dayBusy as slot}{@const from = new Date(slot.start)}{@const to = new Date(
						slot.end
					)}{@const startMinute =
						localDate(from) < date
							? 0
							: from.getHours() * 60 + from.getMinutes()}{@const endMinute =
						localDate(to) > date ? 1440 : to.getHours() * 60 + to.getMinutes()}
					<div
						class="absolute right-2 left-14 rounded-md border-l-2 border-primary-foreground/70 bg-primary-foreground/15 px-2 text-xs"
						style={`top:${startMinute * 0.8}px;height:${Math.max(4, (endMinute - startMinute) * 0.8)}px`}
						aria-label="Calendar busy"
					>
						Busy
					</div>{/each}
			</div>
		</div>
		{#if visibleChoices.length}
			<div class="mt-3 flex flex-wrap gap-2" aria-label="Verified reservation times">
				{#each visibleChoices as choice (`${choice.time}-${choice.experience ?? ''}`)}
					<button
						type="button"
						{disabled}
						class="min-h-11 rounded-xl border border-primary-foreground/20 px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
						onclick={() => onCommitTime(choice.time, choice.experience, date)}
						>{choice.label}{calendarConnected &&
						!loading &&
						!failed &&
						conflictsWithCalendar(date, choice.time, busy)
							? ' · Busy'
							: ''}</button
					>
				{/each}
			</div>
		{/if}
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
				class="flex max-h-56 flex-wrap gap-2 overflow-y-auto"
				aria-label="Verified reservation times"
			>
				{#each visibleChoices as choice (`${choice.time}-${choice.experience ?? ''}`)}<button
						type="button"
						aria-pressed={selectedTime === choice.time &&
							selectedExperience === (choice.experience ?? null)}
						{disabled}
						class="min-h-11 rounded-xl border border-primary-foreground/20 px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 aria-pressed:border-primary-foreground aria-pressed:bg-primary-foreground/15"
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
				No verified times for this date.
			</p>
		{:else}<div class="flex items-end gap-2">
				<label class="flex-1 text-xs text-primary-foreground/60"
					>Time<input
						type="time"
						bind:value={time}
						{disabled}
						class="mt-1 min-h-11 w-full rounded-xl border border-primary-foreground/20 bg-secondary px-3 text-base text-primary-foreground"
					/></label
				><button
					type="button"
					disabled={disabled || !time}
					class="min-h-11 rounded-xl bg-primary-foreground px-3 text-sm font-medium text-primary disabled:opacity-50"
					onclick={chooseTime}>Use time</button
				>
			</div>{/if}
		{#if !verifiedDate && time && calendarConnected && !loading && !failed && conflictsWithCalendar(date, inputTime, busy)}<p
				class="mt-2 text-xs text-primary-foreground/70"
			>
				This time overlaps your calendar in the following two hours.
			</p>{/if}
	{/if}
	{#if view !== 'month'}<div class="mt-3 flex items-center justify-between gap-2">
			<input
				type="date"
				bind:value={date}
				{disabled}
				aria-label="Date"
				class="min-h-11 min-w-0 rounded-xl border border-primary-foreground/20 bg-secondary px-2 text-sm text-primary-foreground"
			/>{#if !verifiedDate || date !== verifiedDate}<button
					type="button"
					{disabled}
					class="min-h-11 rounded-xl px-3 text-xs font-medium underline underline-offset-4 disabled:opacity-50"
					onclick={() => onCommitDate(date)}>{verifiedDate ? 'Check date' : 'Use date'}</button
				>{/if}
		</div>{/if}
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
