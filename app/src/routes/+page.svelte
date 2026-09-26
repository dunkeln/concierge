<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import SFIcon from '@alexdev404/sficons-svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import * as Message from '$lib/components/ui/message';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let input = $state('');
	const chat = new Chat({});

	function send(event: SubmitEvent) {
		event.preventDefault();
		const text = input.trim();
		if (!text || !data.chatConfigured || chat.status !== 'ready') return;
		input = '';
		void chat.sendMessage({ text });
	}

	function newChat() {
		chat.messages = [];
		chat.clearError();
		input = '';
	}
</script>

<svelte:head><title>Concierge</title></svelte:head>

<main class="flex min-h-0 w-full flex-1 flex-col pb-6">
	<div class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
		{#if chat.messages.length}
			<button
				type="button"
				class="self-end text-xs text-primary-foreground/60 hover:text-primary-foreground disabled:opacity-50"
				disabled={chat.status === 'submitted' || chat.status === 'streaming'}
				onclick={newChat}>New chat</button
			>
		{/if}
		<div
			class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain py-10"
			aria-live="polite"
		>
			{#each chat.messages as message (message.id)}
				<Message.Root align={message.role === 'user' ? 'end' : 'start'}>
					<Message.Content>
						<Bubble.Root variant={message.role === 'user' ? 'secondary' : 'ghost'}>
							<Bubble.Content class="whitespace-pre-wrap">
								{#each message.parts as part, index (index)}
									{#if part.type === 'text'}{part.text}{/if}
								{/each}
							</Bubble.Content>
						</Bubble.Root>
					</Message.Content>
				</Message.Root>
			{:else}
				<p class="mt-auto text-center text-sm text-primary-foreground/55">
					Tell me when, where, and how many people.
				</p>
			{/each}
			{#if chat.status === 'submitted'}
				<p class="text-sm text-primary-foreground/55" role="status">Thinking…</p>
			{/if}
			{#if chat.error}
				<div class="flex items-center gap-3 text-sm text-destructive" role="alert">
					<span>That message didn't go through.</span>
					<button type="button" class="underline" onclick={() => void chat.regenerate()}
						>Retry</button
					>
				</div>
			{/if}
		</div>

		{#if !data.chatConfigured}
			<p class="mb-3 text-center text-sm text-primary-foreground/60" role="status">
				Add OPENROUTER_API_KEY to enable chat.
			</p>
		{/if}
		<form
			onsubmit={send}
			class="flex shrink-0 items-end gap-3 rounded-xl border border-primary-foreground/20 bg-secondary p-3"
		>
			<label for="message" class="sr-only">Your reservation request</label>
			<textarea
				id="message"
				bind:value={input}
				rows="2"
				placeholder="Table for two in the West Village on Friday, 7–9pm…"
				class="min-h-12 flex-1 resize-none border-0 bg-transparent text-sm text-primary-foreground placeholder:text-primary-foreground/45 focus:ring-0"
				disabled={!data.chatConfigured}></textarea>
			<button
				type="submit"
				aria-label="Send message"
				class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground text-primary disabled:opacity-50"
				disabled={!data.chatConfigured || !input.trim() || chat.status !== 'ready'}
			>
				<SFIcon icon="arrow-up" size="lg" />
			</button>
		</form>
	</div>
</main>
