<script lang="ts">
	let {
		id,
		question,
		options,
		disabled,
		onReply
	}: {
		id: string;
		question: string;
		options: string[];
		disabled: boolean;
		onReply: (answer: string) => void;
	} = $props();
	let answer = $state('');
</script>

<section
	class="w-full max-w-md rounded-xl border border-primary-foreground/20 bg-secondary p-3 text-sm"
>
	<p class="mb-3 font-medium">{question}</p>
	{#if options.length}
		<div class="mb-3 flex flex-wrap gap-2">
			{#each options as option}
				<button
					type="button"
					{disabled}
					class="min-h-11 rounded-lg border border-primary-foreground/25 px-3 text-left hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
					onclick={() => onReply(option)}>{option}</button
				>
			{/each}
		</div>
	{/if}
	<form
		class="flex items-end gap-2 rounded-xl border border-primary-foreground/20 bg-primary p-1"
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
