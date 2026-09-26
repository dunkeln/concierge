<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import SFIcon from '@alexdev404/sficons-svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import * as Message from '$lib/components/ui/message';
	import MapWidget from '$lib/MapWidget.svelte';
	import ReservationCalendar from '$lib/ReservationCalendar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let input = $state('');
	let selectedPlace = $state<{ id: string; name: string } | null>(null);
	let selectedDate = $state<string | null>(null);
	let selectedSlot = $state<{
		venue: string;
		date: string;
		partySize: number;
		time: string;
	} | null>(null);
	const chat = new Chat({
		transport: new DefaultChatTransport({
			prepareSendMessagesRequest: ({ messages }) => ({
				body: {
					messages,
					selectedPlace: $state.snapshot(selectedPlace),
					selectedDate,
					selectedSlot: $state.snapshot(selectedSlot)
				}
			})
		})
	});

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
		selectedPlace = null;
		selectedDate = null;
		selectedSlot = null;
	}

	type Place = { id: string; name: string; lat: number; lon: number };
	type Inspection = {
		venue: string;
		date: string;
		partySize: number;
		times: string[];
		complete: boolean;
		checkedAt: string | null;
		status: string;
	};

	function mapboxPlaces(message: (typeof chat.messages)[number]) {
		return message.parts.flatMap((part) => {
			if (
				part.type !== 'tool-execute' ||
				part.state !== 'output-available' ||
				typeof part.output !== 'object' ||
				part.output === null ||
				!('attribution' in part.output) ||
				!('places' in part.output) ||
				!Array.isArray(part.output.places)
			)
				return [];
			return part.output.places.filter(
				(place): place is Place =>
					typeof place?.id === 'string' &&
					typeof place?.name === 'string' &&
					Number.isFinite(place?.lat) &&
					Number.isFinite(place?.lon)
			);
		});
	}

	function reservationInspection(message: (typeof chat.messages)[number]): Inspection | null {
		for (const part of message.parts) {
			if (part.type !== 'tool-execute' || part.state !== 'output-available') continue;
			const output = part.output as {
				request?: Record<string, unknown>;
				inspection?: Record<string, unknown>;
				availability?: unknown;
			} | null;
			const request = output?.request;
			const inspection = output?.inspection;
			if (
				typeof request?.date !== 'string' ||
				!/^\d{4}-\d{2}-\d{2}$/.test(request.date) ||
				typeof request.venue !== 'string' ||
				typeof request.partySize !== 'number'
			)
				continue;
			return {
				venue: request.venue,
				date: request.date,
				partySize: request.partySize,
				times: Array.isArray(inspection?.visibleTimes)
					? inspection.visibleTimes.filter((time): time is string => typeof time === 'string')
					: [],
				complete: inspection?.complete === true,
				checkedAt: typeof inspection?.checkedAt === 'string' ? inspection.checkedAt : null,
				status: typeof output?.availability === 'string' ? output.availability : 'Not checked.'
			};
		}
		return null;
	}

	function hasMapboxResult(message: (typeof chat.messages)[number]) {
		return message.parts.some(
			(part) =>
				part.type === 'tool-execute' &&
				part.state === 'output-available' &&
				typeof part.output === 'object' &&
				part.output !== null &&
				'attribution' in part.output &&
				'places' in part.output
		);
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
				{@const places = mapboxPlaces(message)}
				{@const inspection = reservationInspection(message)}
				<Message.Root align={message.role === 'user' ? 'end' : 'start'}>
					<Message.Content>
						<Bubble.Root variant={message.role === 'user' ? 'secondary' : 'ghost'}>
							<Bubble.Content class="whitespace-pre-wrap">
								{#each message.parts as part, index (index)}
									{#if part.type === 'text'}{part.text}{/if}
								{/each}
							</Bubble.Content>
						</Bubble.Root>
						{#if message.role === 'assistant' && places.length}
							{#if data.mapboxToken}
								<div class="mx-3 w-full max-w-xl">
									<MapWidget
										{places}
										token={data.mapboxToken}
										selectedId={selectedPlace?.id ?? null}
										onSelect={(place) => (selectedPlace = { id: place.id, name: place.name })}
									/>
								</div>
							{/if}
							<select
								aria-label="Select a restaurant from map results"
								class="mx-3 max-w-full rounded-lg border border-primary-foreground/25 bg-secondary px-3 py-2 text-xs text-primary-foreground"
								value={selectedPlace?.id ?? ''}
								onchange={(event) => {
									const place = places.find(({ id }) => id === event.currentTarget.value);
									selectedPlace = place ? { id: place.id, name: place.name } : null;
								}}
							>
								<option value="">Select a restaurant</option>
								{#each places as place, index (`${place.id}-${index}`)}
									<option value={place.id}>{place.name}</option>
								{/each}
							</select>
						{/if}
						{#if message.role === 'assistant' && inspection}
							<ReservationCalendar
								{inspection}
								selectedTime={selectedSlot?.date === inspection.date &&
								selectedSlot.venue === inspection.venue
									? selectedSlot.time
									: null}
								onSelectDate={(date) => {
									selectedDate = date;
									selectedSlot = null;
								}}
								onSelectTime={(time) => {
									selectedDate = inspection.date;
									selectedSlot = {
										venue: inspection.venue,
										date: inspection.date,
										partySize: inspection.partySize,
										time
									};
								}}
							/>
						{/if}
						{#if message.role === 'assistant' && hasMapboxResult(message)}
							<a
								href="https://www.mapbox.com/about/maps/"
								class="px-3 text-xs text-primary-foreground/70 underline-offset-2 hover:underline"
								target="_blank"
								rel="noopener noreferrer">© Mapbox and its suppliers · Terms</a
							>
						{/if}
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
		{#if selectedPlace}
			<div class="mb-2 flex items-center justify-between px-2 text-xs text-primary-foreground/70">
				<span>Selected: {selectedPlace.name}</span>
				<button type="button" class="underline" onclick={() => (selectedPlace = null)}>Clear</button
				>
			</div>
		{/if}
		{#if selectedDate}
			<div class="mb-2 flex items-center justify-between px-2 text-xs text-primary-foreground/70">
				<span
					>Selected: {selectedDate}{selectedSlot
						? ` · ${selectedSlot.venue} at ${selectedSlot.time}`
						: ''}</span
				>
				<button
					type="button"
					class="underline"
					onclick={() => {
						selectedDate = null;
						selectedSlot = null;
					}}>Clear</button
				>
			</div>
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
