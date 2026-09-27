<script lang="ts">
	import { conflictsWithCalendar } from '$lib/calendar-conflict';
	type Inspection = {
		venue: string;
		date: string;
		partySize: number;
		times: string[];
		experiences?: { name: string; times: string[] }[];
		complete: boolean;
		checkedAt: string | null;
		status: string;
	};
	let {
		inspection,
		googleEnabled,
		calendarConnected,
		selectedTime,
		selectedExperience,
		onSelectDate,
		onSelectTime
	}: {
		inspection: Inspection;
		googleEnabled: boolean;
		calendarConnected: boolean;
		selectedTime: string | null;
		selectedExperience?: string | null;
		onSelectDate: (date: string) => void;
		onSelectTime: (time: string, experience?: string) => void;
	} = $props();
	let chosenDate = $state<string | null>(null);
	let date = $derived(chosenDate ?? inspection.date);
	const minutes = (time: string) => {
		const [, hour, minute, period] = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(time) ?? [];
		return hour ? ((Number(hour) % 12) + (period === 'PM' ? 12 : 0)) * 60 + Number(minute) : 0;
	};
	let times = $derived(inspection.times.toSorted((a, b) => minutes(a) - minutes(b)));
	let choices = $derived(
		times.flatMap((time) => {
			const matching = inspection.experiences?.filter((item) => item.times.includes(time)) ?? [];
			return matching.length > 1
				? matching.map((item) => ({ time, experience: item.name, label: `${time} · ${item.name}` }))
				: [{ time, experience: matching[0]?.name, label: time }];
		})
	);
	let busy = $state<{ start: string; end: string }[]>([]);
	let calendarCount = $state(0);
	let calendarComplete = $state(false);
	let calendarStatus = $state<'loading' | 'ready' | 'error'>('loading');
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	$effect(() => {
		if (!calendarConnected || date !== inspection.date || !inspection.times.length) return;
		const controller = new AbortController();
		calendarStatus = 'loading';
		fetch(`/api/calendar/busy?date=${encodeURIComponent(inspection.date)}`, {
			signal: controller.signal
		})
			.then(async (response) => {
				if (!response.ok) throw new Error('Calendar lookup failed');
				return response.json();
			})
			.then(
				(result: {
					busy: { start: string; end: string }[];
					calendarCount: number;
					complete: boolean;
				}) => {
					busy = result.busy;
					calendarCount = result.calendarCount;
					calendarComplete = result.complete;
					calendarStatus = 'ready';
				}
			)
			.catch(() => {
				if (!controller.signal.aborted) calendarStatus = 'error';
			});
		return () => controller.abort();
	});
</script>

<section
	class="mx-3 max-w-full rounded-lg border border-primary-foreground/20 bg-secondary p-3 text-sm"
	aria-label="Reservation calendar"
>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<div>
			<p class="font-medium">{inspection.venue}</p>
			<p class="text-xs text-primary-foreground/60">{inspection.partySize} guests · SevenRooms</p>
		</div>
		<label class="flex items-center gap-2 text-xs text-primary-foreground/70">
			Date
			<input
				type="date"
				value={date}
				onchange={(event) => {
					chosenDate = event.currentTarget.value;
					onSelectDate(chosenDate);
				}}
				class="rounded-md border border-primary-foreground/20 bg-primary px-2 py-1 text-primary-foreground"
			/>
		</label>
	</div>
	{#if date === inspection.date}
		{#if times.length}
			<div class="flex flex-wrap gap-2" aria-label="Visible reservation times">
				{#each choices as choice (`${choice.time}-${choice.experience ?? ''}`)}
					<button
						type="button"
						aria-pressed={selectedTime === choice.time &&
							(selectedExperience ?? null) === (choice.experience ?? null)}
						class="rounded-md border border-primary-foreground/25 px-3 py-1.5 text-xs hover:bg-primary-foreground/10 aria-pressed:bg-primary-foreground aria-pressed:text-primary"
						onclick={() => onSelectTime(choice.time, choice.experience)}
						>{choice.label}{calendarStatus === 'ready'
							? conflictsWithCalendar(inspection.date, choice.time, busy)
								? ' · Calendar conflict'
								: calendarComplete
									? ' · No calendar conflict'
									: ' · Calendar check incomplete'
							: ''}</button
					>
				{/each}
			</div>
		{:else}
			<p class="text-xs text-primary-foreground/65">{inspection.status}</p>
		{/if}
		{#if googleEnabled && !calendarConnected}
			<form method="post" action="/?/connectCalendar" class="mt-3">
				<button type="submit" class="text-xs underline underline-offset-2"
					>Connect Google Calendar, then repeat this search to check conflicts</button
				>
			</form>
		{:else if calendarConnected && times.length}
			<p class="mt-3 text-xs text-primary-foreground/55" role="status">
				{calendarStatus === 'loading'
					? 'Checking your calendars…'
					: calendarStatus === 'error'
						? 'Calendar conflicts could not be checked.'
						: `Checked ${calendarCount} calendar${calendarCount === 1 ? '' : 's'}${calendarComplete ? '' : '; some calendars were unavailable'}. Assumes the restaurant is in your device timezone (${timezone}) and a two-hour meal.`}
			</p>
			{#if calendarStatus === 'error' && googleEnabled}
				<form method="post" action="/?/connectCalendar" class="mt-2">
					<button type="submit" class="text-xs underline underline-offset-2"
						>Reconnect Google Calendar</button
					>
				</form>
			{/if}
		{/if}
		{#if inspection.checkedAt}
			<p class="mt-3 text-xs text-primary-foreground/55">
				Checked {new Date(inspection.checkedAt).toLocaleString()}{inspection.complete
					? ''
					: ' · Partial result'}. Times can change.
			</p>
		{/if}
	{:else}
		<p class="text-xs text-primary-foreground/65">
			Choose this date, then ask to check availability.
		</p>
	{/if}
</section>
