<script lang="ts">
	import CalendarView, { type CalendarViewMode } from '$lib/CalendarView.svelte';
	let {
		id,
		options,
		calendarView,
		date,
		calendarConnected,
		googleEnabled,
		disabled,
		onReply
	}: {
		id: string;
		options: string[];
		calendarView?: CalendarViewMode;
		date?: string;
		calendarConnected: boolean;
		googleEnabled: boolean;
		disabled: boolean;
		onReply: (answer: string) => void;
	} = $props();
	let answer = $state('');
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
	<form
		class="flex items-end gap-2 rounded-xl border border-primary-foreground/20 bg-secondary p-1"
		onsubmit={(event) => {
			event.preventDefault();
			if (answer.trim()) onReply(answer.trim());
		}}
	>
		<label class="sr-only" for={`followup-${id}`}>Reply to the agent</label>
		<input
			id={`followup-${id}`}
			bind:value={answer}
			placeholder="Your answer"
			{disabled}
			class="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-2 text-primary-foreground placeholder:text-primary-foreground/45 focus:outline-none"
		/>
		<button
			type="submit"
			disabled={disabled || !answer.trim()}
			class="min-h-11 rounded-lg px-3 font-medium hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
			>Send</button
		>
	</form>
</section>
