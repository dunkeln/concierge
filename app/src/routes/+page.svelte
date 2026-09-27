<script lang="ts">
	import { page } from '$app/state';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import SFIcon from '@alexdev404/sficons-svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import * as Message from '$lib/components/ui/message';
	import MapWidget from '$lib/MapWidget.svelte';
	import ReservationCalendar from '$lib/ReservationCalendar.svelte';
	import FollowupWidget from '$lib/FollowupWidget.svelte';
	import type { CalendarViewMode } from '$lib/CalendarView.svelte';
	import BrowserPreviewStack from '$lib/BrowserPreviewStack.svelte';
	import PassportLedger from '$lib/PassportLedger.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { cuisines, scenarios } from '$lib/onboarding';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let passportOpen = $derived(page.url.searchParams.has('passport'));
	let input = $state('');
	const sceneTitles: Record<(typeof scenarios)[number]['atmosphere'], string> = {
		Quiet: 'Catch up',
		Lively: 'Celebrate',
		Intimate: 'Date night',
		Casual: 'Take it easy',
		Adventurous: 'Try somewhere new',
		Brunch: 'Weekend brunch',
		Coffee: 'Coffee catch-up'
	};
	const sceneImages: Record<(typeof scenarios)[number]['atmosphere'], string> = {
		Quiet: '/editorial/catch-up-outdoors.png',
		Lively: '/editorial/lively-night.png',
		Intimate: '/editorial/rooftop-date.png',
		Casual: '/editorial/easy-counter.png',
		Adventurous: '/editorial/restaurant-arrival-v2.png',
		Brunch: '/editorial/brunch-table.png',
		Coffee: '/editorial/coffee-bar.png'
	};
	let sceneCards = $derived([
		...scenarios.filter(({ atmosphere }) => data.atmospheres.includes(atmosphere)),
		...scenarios.toReversed().filter(({ atmosphere }) => !data.atmospheres.includes(atmosphere))
	]);
	let messageField = $state<HTMLTextAreaElement>();
	type LinkPreview = {
		href: string;
		domain: string;
		label: string;
		x: number;
		y: number;
		above: boolean;
		title: string | null;
		description: string | null;
		image: string | null;
	};
	let linkPreview = $state<LinkPreview | null>(null);
	const previewCache = new Map<string, Pick<LinkPreview, 'title' | 'description' | 'image'>>();
	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	let previewRun = 0;
	let previewLink: HTMLAnchorElement | null = null;

	function hideLinkPreview() {
		clearTimeout(previewTimer);
		previewLink?.removeAttribute('aria-describedby');
		previewLink = null;
		previewRun++;
		linkPreview = null;
	}

	function showLinkPreview(event: PointerEvent | FocusEvent) {
		const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!(link instanceof HTMLAnchorElement) || linkPreview?.href === link.href) return;
		let url: URL;
		try {
			url = new URL(link.href);
		} catch {
			return;
		}
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
		hideLinkPreview();
		previewLink = link;
		link.setAttribute('aria-describedby', 'assistant-link-preview');
		const run = previewRun;
		const rect = link.getBoundingClientRect();
		previewTimer = setTimeout(
			async () => {
				linkPreview = {
					href: link.href,
					domain: url.hostname,
					label: link.textContent?.trim() || url.hostname,
					x: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
					y: rect.bottom + 220 > window.innerHeight ? rect.top - 8 : rect.bottom + 8,
					above: rect.bottom + 220 > window.innerHeight,
					title: null,
					description: null,
					image: null
				};
				if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password)
					return;
				let details = previewCache.get(url.href);
				if (!details) {
					try {
						const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url.href)}`);
						if (!response.ok) return;
						details = await response.json();
						previewCache.set(url.href, details!);
					} catch {
						return;
					}
				}
				if (run === previewRun && linkPreview?.href === link.href && details) {
					linkPreview = { ...linkPreview, ...details };
				}
			},
			event.type === 'focusin' ? 0 : 180
		);
	}

	function leaveLinkPreview(event: PointerEvent | FocusEvent) {
		const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
		if (!link || (event.relatedTarget instanceof Node && link.contains(event.relatedTarget)))
			return;
		hideLinkPreview();
	}
	let selectedPlace = $state<{ id: string; name: string; area: string } | null>(null);
	let selectedCuisine = $state<string | null>(null);
	let sessionCuisine = $state<string | null>(null);
	let selectedDate = $state<string | null>(null);
	let pendingReplyMessageId = $state<string | null>(null);
	let selectedSlot = $state<{
		venue: string;
		date: string;
		partySize: number;
		time: string;
		experience?: string;
		sourceUrl?: string;
	} | null>(null);
	type BrowserSession = {
		id: string;
		venue: string;
		viewPath: string;
		open: boolean;
	};
	let browserSessions = $state<BrowserSession[]>([]);
	type ChatFailure = { message: string; retry: boolean; signIn?: boolean };
	let chatFailure = $derived.by((): ChatFailure | null => {
		if (!chat.error) return null;
		const error = chat.error as Error & { statusCode?: number };
		const status = error.statusCode;
		if (status === 401)
			return { message: 'Your session expired. Sign in again.', retry: false, signIn: true };
		if (status === 413)
			return { message: 'This chat is too long. Start a new chat.', retry: false };
		if (status === 400)
			return { message: 'This chat could not be sent. Start a new chat.', retry: false };
		if (status === 429) return { message: 'Too many requests. Try again shortly.', retry: true };
		if (status === 503)
			return { message: 'Chat service is unavailable. Try again later.', retry: true };
		if (typeof status === 'number' && status >= 500)
			return { message: 'Chat server failed. Please retry.', retry: true };
		if (error.message === 'The model service has no available credits.')
			return { message: error.message, retry: false };
		if (
			error.message === 'The model is busy. Please retry shortly.' ||
			error.message === 'The model service is unavailable. Please retry.' ||
			error.message === 'The assistant stopped before finishing. Please retry.'
		)
			return { message: error.message, retry: true };
		return { message: 'The connection or response failed. Please retry.', retry: true };
	});
	const chat = new Chat({
		onData: (part) => {
			if (part.type !== 'data-browser') return;
			if (!part.data || typeof part.data !== 'object') return;
			const event = part.data as Partial<BrowserSession>;
			if (typeof event.id !== 'string' || !event.id || event.id.length > 200) return;
			if (event.open === false) {
				browserSessions = browserSessions.map((session) =>
					session.id === event.id ? { ...session, open: false, viewPath: '' } : session
				);
				return;
			}
			if (
				event.open !== true ||
				typeof event.venue !== 'string' ||
				event.venue.length > 100 ||
				typeof event.viewPath !== 'string' ||
				!/^\/api\/reservations\/view\?ticket=[\w.-]+$/.test(event.viewPath)
			)
				return;
			browserSessions = [
				...browserSessions.filter((session) => session.id !== event.id),
				event as BrowserSession
			].slice(-5);
		},
		transport: new DefaultChatTransport({
			prepareSendMessagesRequest: ({ messages }) => ({
				body: {
					messages,
					selectedPlace: $state.snapshot(selectedPlace),
					preferredCuisine: sessionCuisine,
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

	async function replyTo(messageId: string, text: string) {
		const reply = text.trim();
		if (!reply || !data.chatConfigured || chat.status !== 'ready' || pendingReplyMessageId) return;
		pendingReplyMessageId = messageId;
		try {
			await chat.sendMessage({ text: reply });
		} catch {
			// The chat surface offers Retry for failed sends.
		} finally {
			pendingReplyMessageId = null;
		}
	}

	function newChat() {
		chat.messages = [];
		chat.clearError();
		input = '';
		selectedPlace = null;
		selectedCuisine = null;
		sessionCuisine = null;
		selectedDate = null;
		selectedSlot = null;
		browserSessions = [];
		pendingReplyMessageId = null;
	}

	function followupFor(message: (typeof chat.messages)[number]) {
		for (const part of message.parts) {
			if (part.type !== 'tool-execute' || part.state !== 'output-available') continue;
			const output = part.output as Record<string, unknown> | null;
			if (
				output?.kind === 'followup' &&
				typeof output.question === 'string' &&
				Array.isArray(output.options) &&
				output.options.every((option) => typeof option === 'string')
			)
				return {
					question: output.question,
					options: output.options as string[],
					calendarView: ['month', 'day', 'time'].includes(String(output.calendarView))
						? (output.calendarView as CalendarViewMode)
						: undefined,
					date:
						typeof output.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(output.date)
							? output.date
							: undefined
				};
		}
		return null;
	}

	type Place = { id: string; name: string; lat: number; lon: number; categories?: string[] };
	type Inspection = {
		venue: string;
		date: string;
		partySize: number;
		sourceUrl?: string;
		experiences?: { name: string; times: string[] }[];
		times: string[];
		calendarView?: CalendarViewMode;
		complete: boolean;
		checkedAt: string | null;
		status: string;
	};

	function placeSearches(message: (typeof chat.messages)[number]) {
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
			const places = part.output.places.filter(
				(place): place is Place =>
					typeof place?.id === 'string' &&
					typeof place?.name === 'string' &&
					Number.isFinite(place?.lat) &&
					Number.isFinite(place?.lon)
			);
			return places.length
				? [
						{
							area:
								'area' in part.output && typeof part.output.area === 'string'
									? part.output.area
									: 'Search area',
							places
						}
					]
				: [];
		});
	}

	function reservationInspections(message: (typeof chat.messages)[number]): Inspection[] {
		return message.parts.flatMap((part) => {
			if (part.type !== 'tool-execute' || part.state !== 'output-available') return [];
			const output = part.output as {
				request?: Record<string, unknown>;
				inspection?: Record<string, unknown>;
				availability?: unknown;
				calendarView?: unknown;
			} | null;
			const request = output?.request;
			const inspection = output?.inspection;
			if (
				typeof request?.date !== 'string' ||
				!/^\d{4}-\d{2}-\d{2}$/.test(request.date) ||
				typeof request.venue !== 'string' ||
				typeof request.partySize !== 'number'
			)
				return [];
			return [
				{
					venue: request.venue,
					date: request.date,
					partySize: request.partySize,
					...(typeof output?.calendarView === 'string' &&
					['month', 'day', 'time'].includes(output.calendarView)
						? { calendarView: output.calendarView as CalendarViewMode }
						: {}),
					...(typeof inspection?.url === 'string' ? { sourceUrl: inspection.url } : {}),
					...(Array.isArray(inspection?.experiences)
						? {
								experiences: inspection.experiences.filter(
									(item): item is { name: string; times: string[] } =>
										typeof item?.name === 'string' &&
										Array.isArray(item.times) &&
										item.times.every((time: unknown) => typeof time === 'string')
								)
							}
						: {}),
					times: Array.isArray(inspection?.visibleTimes)
						? inspection.visibleTimes.filter((time): time is string => typeof time === 'string')
						: [],
					complete: inspection?.complete === true,
					checkedAt: typeof inspection?.checkedAt === 'string' ? inspection.checkedAt : null,
					status: typeof output?.availability === 'string' ? output.availability : 'Not checked.'
				}
			];
		});
	}

	function checkoutObservation(message: (typeof chat.messages)[number]) {
		for (const part of message.parts) {
			if (part.type !== 'tool-execute' || part.state !== 'output-available') continue;
			const output = part.output as Record<string, unknown> | null;
			if (output?.status !== 'checkout_ready') continue;
			const url = typeof output.viewPath === 'string' ? output.viewPath : '';
			if (!/^\/api\/reservations\/view\?ticket=[\w.-]+$/.test(url)) continue;
			return {
				url,
				venue: String(output.venue),
				date: String(output.date),
				time: String(output.time),
				experience: typeof output.experience === 'string' ? output.experience : '',
				partySize: Number(output.partySize)
			};
		}
		return null;
	}
</script>

<svelte:head><title>Concierge</title></svelte:head>

<main class="flex min-h-0 w-full flex-1 flex-col pb-6">
	<div class="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
		{#if !passportOpen && chat.messages.length}
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
			onscroll={hideLinkPreview}
		>
			{#if passportOpen}
				<PassportLedger visits={data.visits} atmospheres={data.atmospheres} error={form?.message} />
			{:else}
				{#each chat.messages as message (message.id)}
					{@const searches = placeSearches(message)}
					{@const inspections = reservationInspections(message)}
					{@const checkout = checkoutObservation(message)}
					{@const followup = message.role === 'assistant' ? followupFor(message) : null}
					<Message.Root
						align={message.role === 'user' || followup || inspections.length > 0 ? 'end' : 'start'}
					>
						<Message.Content class="gap-4">
							{#if message.parts.some((part) => part.type === 'text' && part.text.trim())}
								<Bubble.Root variant={message.role === 'user' ? 'secondary' : 'ghost'}>
									<Bubble.Content
										onpointerover={message.role === 'assistant' ? showLinkPreview : undefined}
										onpointerout={message.role === 'assistant' ? leaveLinkPreview : undefined}
										onfocusin={message.role === 'assistant' ? showLinkPreview : undefined}
										onfocusout={message.role === 'assistant' ? leaveLinkPreview : undefined}
										class={message.role === 'assistant'
											? "prose prose-sm max-w-none prose-invert prose-headings:font-medium prose-headings:text-inherit prose-p:my-2 prose-p:leading-relaxed prose-a:font-medium prose-a:text-inherit prose-a:underline prose-a:decoration-primary-foreground/50 prose-a:underline-offset-4 prose-a:after:ml-0.5 prose-a:after:content-['↗'] prose-a:hover:decoration-primary-foreground prose-a:focus-visible:ring-2 prose-a:focus-visible:ring-ring prose-strong:text-inherit prose-code:text-inherit prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-secondary"
											: 'whitespace-pre-wrap'}
									>
										{#each message.parts as part, index (index)}
											{#if part.type === 'text'}
												{#if message.role === 'assistant'}{@html renderMarkdown(
														part.text
													)}{:else}{part.text}{/if}
											{/if}
										{/each}
									</Bubble.Content>
								</Bubble.Root>
							{/if}
							{#if followup}
								<Bubble.Root variant="secondary" class="max-w-md">
									<Bubble.Content>{followup.question}</Bubble.Content>
								</Bubble.Root>
								<FollowupWidget
									id={message.id}
									options={followup.options}
									calendarView={followup.calendarView}
									date={followup.date}
									calendarConnected={data.calendarConnected}
									googleEnabled={data.googleEnabled}
									disabled={!data.chatConfigured ||
										chat.status !== 'ready' ||
										pendingReplyMessageId !== null ||
										chat.messages.at(-1)?.id !== message.id}
									onReply={(answer) => void replyTo(message.id, answer)}
								/>
							{/if}
							{#each message.role === 'assistant' ? searches : [] as search}
								{@const places = search.places}
								<p class="px-3 text-xs text-primary-foreground/70">{search.area}</p>
								<div class="mx-3 w-full max-w-xl">
									<MapWidget
										{places}
										token={data.geoapifyMapKey}
										selectedId={selectedPlace?.id ?? null}
										onSelect={(place) => {
											selectedPlace = { id: place.id, name: place.name, area: search.area };
											selectedCuisine =
												cuisines.find((cuisine) =>
													place.categories?.some((category) =>
														category.endsWith(`.${cuisine.toLowerCase()}`)
													)
												) ?? null;
										}}
									/>
								</div>
							{/each}
							{#each message.role === 'assistant' ? inspections : [] as inspection}
								<div class="w-full max-w-md self-end">
									<ReservationCalendar
										{inspection}
										googleEnabled={data.googleEnabled}
										calendarConnected={data.calendarConnected}
										disabled={!data.chatConfigured ||
											chat.status !== 'ready' ||
											chat.messages.at(-1)?.id !== message.id}
										selectedTime={selectedSlot?.date === inspection.date &&
										selectedSlot.venue === inspection.venue
											? selectedSlot.time
											: null}
										selectedExperience={selectedSlot?.experience ?? null}
										onSelectDate={(date) => {
											if (
												chat.status !== 'ready' ||
												pendingReplyMessageId ||
												chat.messages.at(-1)?.id !== message.id
											)
												return;
											selectedDate = date;
											selectedSlot = null;
											void replyTo(
												message.id,
												`Please check ${inspection.venue} for ${inspection.partySize} guests on ${date}.`
											);
										}}
										onSelectTime={(time, experience) => {
											if (
												chat.status !== 'ready' ||
												pendingReplyMessageId ||
												chat.messages.at(-1)?.id !== message.id
											)
												return;
											selectedDate = inspection.date;
											selectedSlot = {
												venue: inspection.venue,
												date: inspection.date,
												partySize: inspection.partySize,
												time,
												...(experience ? { experience } : {}),
												...(inspection.sourceUrl ? { sourceUrl: inspection.sourceUrl } : {})
											};
											void replyTo(
												message.id,
												`I choose ${inspection.venue} on ${inspection.date} at ${time}${experience ? ` for ${experience}` : ''} for ${inspection.partySize} guests.`
											);
										}}
									/>
								</div>
							{/each}
							{#if message.role === 'assistant' && checkout}
								<div
									class="mx-3 rounded-lg border border-primary-foreground/20 bg-secondary p-3 text-sm"
								>
									<p>
										{checkout.venue} · {checkout.date} · {checkout.time} · {checkout.partySize} guests{checkout.experience
											? ` · ${checkout.experience}`
											: ''}
									</p>
									<p class="mt-1 text-xs text-primary-foreground/65">
										Provider checkout reached. No booking was submitted. Review the provider’s
										terms; stop before payment. This temporary view expires soon.
									</p>
									<a
										class="mt-2 inline-block text-xs underline underline-offset-2"
										href={checkout.url}
										target="_blank"
										rel="noopener noreferrer">View checkout in live browser</a
									>
								</div>
							{/if}
						</Message.Content>
					</Message.Root>
				{:else}
					<div class="my-auto w-full space-y-5">
						<div class="scene-rail mx-auto flex w-full max-w-2xl snap-x gap-4 overflow-x-auto pb-2">
							{#each sceneCards as scene (scene.atmosphere)}
								<button
									type="button"
									class="scene-card w-[46%] flex-none snap-start text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground"
									onclick={() => {
										input = `${scene.title}. Help me find a place and check if I can reserve it.`;
										messageField?.focus();
									}}
								>
									<span
										class="scene-frame relative block aspect-square overflow-hidden rounded-3xl bg-secondary"
									>
										<img
											src={sceneImages[scene.atmosphere]}
											alt=""
											class="scene-image absolute top-0 -left-[10%] h-full w-[120%] max-w-none object-cover"
										/>
									</span>
									<span
										class="scene-caption mt-3 block text-base font-medium text-primary-foreground"
										>{sceneTitles[scene.atmosphere]}</span
									>
									<span class="sr-only">{scene.detail}</span>
								</button>
							{/each}
						</div>
						{#if data.googleEnabled && !data.calendarConnected}
							<form method="post" action="/?/connectCalendar" class="text-center">
								<button type="submit" class="text-xs underline underline-offset-2"
									>Connect Google Calendar to check conflicts</button
								>
							</form>
						{/if}
					</div>
				{/each}
				{#if browserSessions.some((session) => session.open)}
					<BrowserPreviewStack sessions={browserSessions.filter((session) => session.open)} />
				{/if}
				{#if chat.status === 'submitted'}
					<p class="text-sm text-primary-foreground/55" role="status">Thinking…</p>
				{/if}
				{#if chatFailure}
					<div class="flex items-center gap-3 text-sm text-destructive" role="alert">
						<span>{chatFailure.message}</span>
						{#if chatFailure.retry}
							<button type="button" class="underline" onclick={() => void chat.regenerate()}
								>Retry</button
							>
						{:else if chatFailure.signIn}
							<a class="underline" href="/login">Sign in</a>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
		{#if linkPreview}
			<div
				id="assistant-link-preview"
				role="tooltip"
				class="pointer-events-none fixed z-50 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-primary-foreground/15 bg-popover text-popover-foreground shadow-xl"
				style={`left: ${linkPreview.x}px; top: ${linkPreview.y}px; transform: ${linkPreview.above ? 'translateY(-100%)' : 'none'}`}
			>
				{#if linkPreview.image}
					<img
						src={linkPreview.image}
						alt=""
						class="aspect-[2/1] w-full object-cover"
						onerror={() => {
							if (linkPreview) linkPreview.image = null;
						}}
					/>
				{/if}
				<div class="space-y-1 p-3">
					<p class="truncate text-xs text-popover-foreground/60">{linkPreview.domain}</p>
					<p class="line-clamp-2 text-sm font-medium">{linkPreview.title || linkPreview.label}</p>
					{#if linkPreview.description}
						<p class="line-clamp-3 text-xs leading-relaxed text-popover-foreground/70">
							{linkPreview.description}
						</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if !passportOpen}
			{#if !data.chatConfigured}
				<p class="mb-3 text-center text-sm text-primary-foreground/60" role="status">
					Add OPENROUTER_API_KEY to enable chat.
				</p>
			{/if}
			{#if form?.message}
				<p class="mb-3 text-center text-sm text-destructive" role="alert">{form.message}</p>
			{/if}
			{#if selectedPlace}
				<div class="mb-2 flex items-center justify-between px-2 text-xs text-primary-foreground/70">
					<span>Selected: {selectedPlace.name}</span>
					<div class="flex items-center gap-3">
						{#if selectedCuisine}
							<button
								type="button"
								class="underline"
								aria-pressed={sessionCuisine === selectedCuisine}
								onclick={() =>
									(sessionCuisine = sessionCuisine === selectedCuisine ? null : selectedCuisine)}
								>More {selectedCuisine}{sessionCuisine === selectedCuisine ? ' ✓' : ''}</button
							>
						{/if}
						<button
							type="button"
							class="underline"
							onclick={() => {
								selectedPlace = null;
								selectedCuisine = null;
							}}>Clear</button
						>
					</div>
				</div>
			{/if}
			{#if selectedDate}
				<div class="mb-2 flex items-center justify-between px-2 text-xs text-primary-foreground/70">
					<span
						>Selected: {selectedDate}{selectedSlot
							? ` · ${selectedSlot.venue} at ${selectedSlot.time}${selectedSlot.experience ? ` · ${selectedSlot.experience}` : ''}`
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
				{#if selectedSlot?.sourceUrl}
					<button
						type="button"
						class="mb-2 self-end rounded-lg border border-primary-foreground/25 px-3 py-1.5 text-xs hover:bg-primary-foreground/10 disabled:opacity-50"
						disabled={chat.status !== 'ready'}
						onclick={() =>
							void chat.sendMessage({
								text: 'Continue my selected time to checkout. Stop before entering guest or payment details or submitting.'
							})}>Continue to checkout</button
					>
				{/if}
			{/if}
			<form
				onsubmit={send}
				class="flex shrink-0 items-end gap-3 rounded-4xl border border-primary-foreground/20 bg-secondary p-3"
			>
				<label for="message" class="sr-only">Your reservation request</label>
				<textarea
					id="message"
					bind:this={messageField}
					bind:value={input}
					enterkeyhint="send"
					onkeydown={(event) => {
						if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
						event.preventDefault();
						event.currentTarget.form?.requestSubmit();
					}}
					rows="2"
					placeholder="Coffee, brunch, or dinner—where, when, and for how many?"
					class="min-h-12 flex-1 resize-none border-0 bg-transparent text-sm text-primary-foreground placeholder:text-primary-foreground/45 focus:ring-0"
					disabled={!data.chatConfigured}></textarea>
				<button
					type="submit"
					aria-label="Send message"
					class="flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground transition-colors hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground active:bg-primary-foreground/15 disabled:text-primary-foreground/35 disabled:hover:bg-transparent"
					disabled={!data.chatConfigured || !input.trim() || chat.status !== 'ready'}
				>
					<SFIcon icon="arrow-up" size="md" weight="semibold" />
				</button>
			</form>
		{/if}
	</div>
</main>

<style>
	.scene-rail {
		scrollbar-width: none;
	}
	.scene-rail::-webkit-scrollbar {
		display: none;
	}

	@supports (animation-timeline: view(inline)) {
		@media (prefers-reduced-motion: no-preference) {
			.scene-card {
				view-timeline-name: --scene;
				view-timeline-axis: inline;
			}
			.scene-image {
				animation: scene-parallax linear both;
				animation-timeline: --scene;
				animation-range: cover 0% cover 100%;
			}
			.scene-caption {
				animation: scene-caption linear both;
				animation-timeline: --scene;
				animation-range: cover 0% cover 100%;
			}
		}
	}

	@keyframes scene-parallax {
		from {
			transform: translateX(-8%);
		}
		to {
			transform: translateX(8%);
		}
	}

	@keyframes scene-caption {
		0%,
		100% {
			opacity: 0.35;
			transform: translateY(6px);
		}
		50% {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
