<script lang="ts">
	import CalendarView, { type CalendarViewMode } from '$lib/CalendarView.svelte';
	let {
		options,
		calendarView,
		date,
		calendarConnected,
		googleEnabled,
		disabled,
		onReply
	}: {
		options: string[];
		calendarView?: CalendarViewMode;
		date?: string;
		calendarConnected: boolean;
		googleEnabled: boolean;
		disabled: boolean;
		onReply: (answer: string) => void;
	} = $props();
	const today = new Date();
	const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
</script>

<section class="w-full max-w-md space-y-3 self-end text-sm" aria-label="Follow-up response">
	{#if calendarView}
		<CalendarView
			initialView={calendarView}
			initialDate={date ?? todayString}
			{calendarConnected}
			{googleEnabled}
			{disabled}
			onCommitDate={(selected) => onReply(selected)}
			onCommitTime={(selected, _experience, selectedDate) =>
				onReply(`${selected} on ${selectedDate}`)}
		/>
	{/if}
	{#if options.length}
		<div class="flex flex-wrap gap-2">
			{#each options as option}
				<button
					type="button"
					{disabled}
					class="min-h-11 rounded-lg border border-primary-foreground/25 bg-secondary px-3 text-left hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
					onclick={() => onReply(option)}>{option}</button
				>
			{/each}
		</div>
	{/if}
</section>
