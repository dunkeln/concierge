<script lang="ts">
	type Inspection = {
		venue: string;
		date: string;
		partySize: number;
		times: string[];
		complete: boolean;
		checkedAt: string | null;
		status: string;
	};
	let {
		inspection,
		selectedTime,
		onSelectDate,
		onSelectTime
	}: {
		inspection: Inspection;
		selectedTime: string | null;
		onSelectDate: (date: string) => void;
		onSelectTime: (time: string) => void;
	} = $props();
	let chosenDate = $state<string | null>(null);
	let date = $derived(chosenDate ?? inspection.date);
	const minutes = (time: string) => {
		const [, hour, minute, period] = /^(\d{1,2}):(\d{2}) ([AP]M)$/.exec(time) ?? [];
		return hour ? ((Number(hour) % 12) + (period === 'PM' ? 12 : 0)) * 60 + Number(minute) : 0;
	};
	let times = $derived(inspection.times.toSorted((a, b) => minutes(a) - minutes(b)));
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
				{#each times as time (time)}
					<button
						type="button"
						aria-pressed={selectedTime === time}
						class="rounded-md border border-primary-foreground/25 px-3 py-1.5 text-xs hover:bg-primary-foreground/10 aria-pressed:bg-primary-foreground aria-pressed:text-primary"
						onclick={() => onSelectTime(time)}>{time}</button
					>
				{/each}
			</div>
		{:else}
			<p class="text-xs text-primary-foreground/65">{inspection.status}</p>
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
