<script lang="ts">
	import { beforeNavigate, goto, invalidateAll, replaceState } from '$app/navigation';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import SFIcon from '@alexdev404/sficons-svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import * as Message from '$lib/components/ui/message';
	import MenuCard from '$lib/MenuCard.svelte';
	import type { Menu, DishSelection } from '$lib/menu';
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
	const initialThread = untrack(() => data.thread);
	let threadId = $state(initialThread?.id ?? '');
	let loadedThreadId: string | null = initialThread?.id ?? null;
	let loadedLastMessageId = initialThread?.messages.at(-1)?.id;
	let oldestPosition = $state(untrack(() => data.thread?.oldestPosition ?? null));
	let hasOlder = $state(untrack(() => data.thread?.hasOlder ?? false));
	let loadingOlder = $state(false);
	let persistedResponse = false;
	let historyFailure = $state<string | null>(null);
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
	let sceneCards = $derived.by(() => {
		const preferred = scenarios.filter(({ atmosphere }) =>
			data.profile?.atmospheres.includes(atmosphere)
		);
		return [
			...preferred,
			...scenarios.toReversed().filter((scene) => !preferred.includes(scene))
		].slice(0, 5);
	});
	let welcomePrompt = $derived.by(() => {
		const firstName = data.user?.name?.trim().split(/\s+/)[0];
		const greeting = firstName ? `Hey ${firstName}` : 'Hey';
		const favorites = [...new Set(data.profile?.cuisines ?? [])].slice(0, 2);
		if (favorites.length) return `${greeting}, in the mood for ${favorites.join(' or ')}?`;
		const outing = sceneCards[0];
		return data.profile?.atmospheres.length && outing
			? `${greeting}, how about ${outing.title.charAt(0).toLowerCase() + outing.title.slice(1)}?`
			: `${greeting}, coffee, a catch-up, or somewhere new?`;
	});
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
	let selectedPlace = $state<{ id: string; name: string; area: string } | null>(
		(initialThread?.context.selectedPlace as { id: string; name: string; area: string }) ?? null
	);
	let selectedDishes = $state<DishSelection[]>(
		(initialThread?.context.selectedDishes as DishSelection[]) ?? []
	);
	let selectedCuisine = $state<string | null>(null);
	let sessionCuisine = $state<string | null>(
		(initialThread?.context.preferredCuisine as string) ?? null
	);
	let selectedDate = $state<string | null>((initialThread?.context.selectedDate as string) ?? null);
	let pendingReplyMessageId = $state<string | null>(null);
	let selectedSlot = $state<{
		venue: string;
		date: string;
		partySize: number;
		time: string;
		experience?: string;
		sourceUrl?: string;
	} | null>(
		(initialThread?.context.selectedSlot as {
			venue: string;
			date: string;
			partySize: number;
			time: string;
			experience?: string;
			sourceUrl?: string;
		}) ?? null
	);
	type BrowserSession = {
		id: string;
		venue: string;
		viewPath: string;
		open: boolean;
		image?: string;
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
			return { message: 'This chat is still too long. Start a new chat.', retry: false };
		if (status === 400)
			return { message: 'This chat could not be sent. Start a new chat.', retry: false };
		if (status === 409)
			return {
				message: 'This chat is still responding in another tab. Try again shortly.',
				retry: true
			};
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
		messages: untrack(() => data.thread?.messages ?? []),
		onFinish: async ({ isDisconnect }) => {
			const finishedThread = threadId;
			if (!finishedThread || page.url.pathname !== '/' || passportOpen) return;
			try {
				// A lost response can follow a successful commit. Recover storage, never resend the model.
				if (!persistedResponse) {
					if (!isDisconnect && chat.error?.name !== 'TimeoutError') return;
					const saved = await fetch(`/api/chats/${finishedThread}?before=2147483647`, {
						signal: AbortSignal.timeout(10_000)
					});
					if (!saved.ok) return;
				}
				if (threadId !== finishedThread || page.url.pathname !== '/' || passportOpen) return;
				await goto(`/?chat=${finishedThread}`, {
					replaceState: true,
					invalidateAll: true,
					keepFocus: true,
					noScroll: true
				});
			} catch {
				// Keep the existing error/retry surface if saved history cannot be reached.
			}
		},
		onData: (part) => {
			if (part.type !== 'data-browser') return;
			if (!part.data || typeof part.data !== 'object') return;
			const event = part.data as Partial<BrowserSession>;
			if (typeof event.id !== 'string' || !event.id || event.id.length > 200) return;
			if (
				typeof event.image === 'string' &&
				event.image.length <= 2_000_000 &&
				/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(event.image)
			) {
				browserSessions = browserSessions.map((session) =>
					session.id === event.id && session.open ? { ...session, image: event.image } : session
				);
				return;
			}
			if (event.open === false) {
				browserSessions = browserSessions.map((session) =>
					session.id === event.id
						? { ...session, open: false, viewPath: '', image: undefined }
						: session
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
			fetch: async (input, init) => {
				persistedResponse = false;
				// Covers response-body delivery too; local abort does not cancel the server's durable turn.
				const response = await fetch(input, {
					...init,
					signal: AbortSignal.any([
						...(init?.signal ? [init.signal] : []),
						AbortSignal.timeout(210_000)
					])
				});
				persistedResponse = response.ok && response.headers.get('x-chat-thread') === threadId;
				return response;
			},
			prepareSendMessagesRequest: ({ messages }) => {
				if (!threadId) {
					threadId = crypto.randomUUID();
					loadedThreadId = threadId;
					replaceState(`/?chat=${threadId}`, {});
				}
				return {
					body: {
						threadId,
						messages: [messages.filter((message) => message.role === 'user').at(-1)],
						selectedPlace: $state.snapshot(selectedPlace),
						preferredCuisine: sessionCuisine,
						selectedDate,
						selectedSlot: $state.snapshot(selectedSlot),
						selectedDishes: $state.snapshot(selectedDishes)
					}
				};
			}
		})
	});

	function send(event: SubmitEvent) {
		event.preventDefault();
		const text = input.trim();
		if (!text || !data.chatConfigured || chat.status !== 'ready' || data.thread?.pending) return;
		input = '';
		const current = chat.messages.at(-1);
		if (current?.role === 'assistant' && followupFor(current)) void replyTo(current.id, text);
		else void chat.sendMessage({ text });
	}

	async function replyTo(messageId: string, text: string) {
		const reply = text.trim();
		if (
			!reply ||
			!data.chatConfigured ||
			chat.status !== 'ready' ||
			data.thread?.pending ||
			pendingReplyMessageId
		)
			return;
		pendingReplyMessageId = messageId;
		messageField?.focus();
		try {
			await chat.sendMessage({ text: reply });
		} catch {
			// The chat surface offers Retry for failed sends.
		} finally {
			pendingReplyMessageId = null;
		}
	}

	$effect(() => {
		const saved = data.thread;
		untrack(() => {
			const id = saved?.id ?? null;
			if (
				(id === loadedThreadId && saved?.messages.at(-1)?.id === loadedLastMessageId) ||
				chat.status === 'submitted' ||
				chat.status === 'streaming'
			)
				return;
			// Equal assistant IDs do not prove equal content after a quietly truncated stream.
			const changedThread = id !== loadedThreadId;
			loadedThreadId = id;
			loadedLastMessageId = saved?.messages.at(-1)?.id;
			threadId = id ?? '';
			chat.messages = saved?.messages ?? [];
			chat.clearError();
			if (changedThread) input = '';
			browserSessions = [];
			pendingReplyMessageId = null;
			const context = saved?.context ?? {};
			selectedPlace = (context.selectedPlace as typeof selectedPlace) ?? null;
			sessionCuisine = (context.preferredCuisine as string) ?? null;
			selectedDate = (context.selectedDate as string) ?? null;
			selectedSlot = (context.selectedSlot as typeof selectedSlot) ?? null;
			selectedDishes = (context.selectedDishes as DishSelection[]) ?? [];
			selectedCuisine = null;
			oldestPosition = saved?.oldestPosition ?? null;
			hasOlder = saved?.hasOlder ?? false;
		});
	});

	$effect(() => {
		if (!data.thread?.pending || chat.status === 'streaming' || chat.status === 'submitted') return;
		const timer = setTimeout(() => void invalidateAll(), 3_000);
		return () => clearTimeout(timer);
	});

	beforeNavigate(({ to, cancel }) => {
		if (
			(chat.status === 'submitted' || chat.status === 'streaming') &&
			to?.url.pathname === '/' &&
			to.url.searchParams.get('chat') !== threadId
		)
			cancel();
	});

	async function loadOlder() {
		if (!threadId || !oldestPosition || loadingOlder) return;
		loadingOlder = true;
		historyFailure = null;
		try {
			const response = await fetch(`/api/chats/${threadId}?before=${oldestPosition}`);
			if (!response.ok) throw new Error('Could not load earlier messages.');
			const saved = await response.json();
			chat.messages = [...saved.messages, ...chat.messages];
			oldestPosition = saved.oldestPosition;
			hasOlder = saved.hasOlder;
		} catch {
			historyFailure = 'Could not load earlier messages. Try again.';
		} finally {
			loadingOlder = false;
		}
	}

	function newChat() {
		threadId = '';
		loadedThreadId = null;
		hasOlder = false;
		void goto('/');
		chat.messages = [];
		chat.clearError();
		input = '';
		selectedPlace = null;
		selectedDishes = [];
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
					options: (output.options as string[]).map((option) =>
						output.responseType === 'partySize' && /^\d+$/.test(option.trim())
							? `${option.trim()} ${Number(option) === 1 ? 'person' : 'people'}`
							: option
					),
					calendarView:
						['date', 'time'].includes(String(output.responseType)) &&
						['month', 'day', 'time'].includes(String(output.calendarView))
							? (output.calendarView as CalendarViewMode)
							: undefined,
					time:
						typeof output.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(output.time)
							? output.time
							: undefined,
					date:
						typeof output.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(output.date)
							? output.date
							: undefined
				};
		}
		return null;
	}

	const activeFollowup = $derived.by(() => {
		const current = chat.messages.at(-1);
		return current?.role === 'assistant' ? followupFor(current) : null;
	});

	type Place = {
		id: string;
		name: string;
		lat: number;
		lon: number;
		address?: string;
		categories?: string[];
	};
	type Inspection = {
		venue: string;
		date: string;
		partySize: number;
		sourceUrl?: string;
		experiences?: { name: string; times: string[] }[];
		timeGroups?: { requested: string[]; nearby: string[] };
		times: string[];
		calendarView?: CalendarViewMode;
		complete: boolean;
		checkedAt: string | null;
		status: string;
	};

	function menusFor(message: (typeof chat.messages)[number]): Menu[] {
		return message.parts.flatMap((part) => {
			if (part.type !== 'tool-execute' || part.state !== 'output-available') return [];
			const output = part.output as Menu | null;
			return output?.kind === 'menu' && Array.isArray(output.items) && output.items.length
				? [output]
				: [];
		});
	}
	function toggleDish(menu: Menu, id: string) {
		if (selectedDishes.some((dish) => dish.id === id)) {
			selectedDishes = selectedDishes.filter((dish) => dish.id !== id);
			return;
		}
		const item = menu.items.find((dish) => dish.id === id);
		if (!item || selectedDishes.length >= 12) return;
		selectedDishes = [
			...selectedDishes,
			{
				id,
				name: item.name,
				restaurant: menu.restaurant,
				area: menu.area,
				sourceUrl: menu.sourceUrl,
				selectedAt: new Date().toISOString()
			}
		];
	}

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
			const area =
				'area' in part.output && typeof part.output.area === 'string'
					? part.output.area.trim()
					: '';
			const execution = part.input as { input?: { cuisine?: unknown } } | undefined;
			const requestedCuisine =
				typeof execution?.input?.cuisine === 'string' ? execution.input.cuisine : undefined;
			return [
				{
					key: area.toLowerCase() || part.toolCallId,
					area: area || 'Search area',
					places,
					requestedCuisine
				}
			];
		});
	}

	const rollingSearches = $derived.by(() => {
		const searches = new Map<
			string,
			ReturnType<typeof placeSearches>[number] & { messageId: string }
		>();
		for (const message of chat.messages) {
			if (message.role !== 'assistant') continue;
			for (const search of placeSearches(message)) {
				searches.set(search.key, {
					...search,
					messageId: searches.get(search.key)?.messageId ?? message.id
				});
			}
		}
		return [...searches.values()];
	});

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
				typeof inspection?.checkedAt !== 'string' ||
				!Array.isArray(inspection.visibleTimes) ||
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
					...(inspection?.timeGroups &&
					Array.isArray((inspection.timeGroups as Record<string, unknown>).nearby)
						? { timeGroups: inspection.timeGroups as { requested: string[]; nearby: string[] } }
						: {}),
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

<main
	class="flex min-h-0 w-full flex-1 flex-col pb-6 transition-[padding] motion-reduce:transition-none"
>
	<div
		class="mx-auto flex min-h-0 w-full flex-1 flex-col"
		class:max-w-2xl={!passportOpen}
		class:max-w-4xl={passportOpen}
	>
		{#if !passportOpen && chat.messages.length}
			<button
				type="button"
				class="self-end text-xs text-primary-foreground/60 hover:text-primary-foreground disabled:opacity-50"
				disabled={chat.status === 'submitted' || chat.status === 'streaming'}
				onclick={newChat}>New chat</button
			>
		{/if}
		<div
			class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain"
			class:py-10={!passportOpen}
			class:py-4={passportOpen}
			aria-live="polite"
			onscroll={hideLinkPreview}
		>
			{#if historyFailure}<p class="text-sm text-destructive" role="alert">{historyFailure}</p>{/if}
			{#if passportOpen}
				<PassportLedger visits={data.visits} profile={data.profile} error={form?.message} />
			{:else}
				{#if hasOlder}<button
						type="button"
						class="self-center text-xs underline disabled:opacity-50"
						disabled={loadingOlder || chat.status !== 'ready' || data.thread?.pending}
						onclick={() => void loadOlder()}>Earlier messages</button
					>{/if}
				{#each chat.messages as message (message.id)}
					{@const searches = rollingSearches.filter(
						(search) => search.messageId === message.id && search.places.length
					)}
					{@const inspections = reservationInspections(message)}
					{@const checkout = checkoutObservation(message)}
					{@const followup = message.role === 'assistant' ? followupFor(message) : null}
					<Message.Root align={message.role === 'user' ? 'end' : 'start'}>
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
								<Bubble.Root variant="ghost" class="max-w-md">
									<Bubble.Content>{followup.question}</Bubble.Content>
								</Bubble.Root>
							{/if}
							{#if followup && chat.messages.at(-1)?.id === message.id}
								<FollowupWidget
									options={followup.options}
									calendarView={followup.calendarView}
									date={followup.date ?? selectedDate ?? undefined}
									time={followup.time}
									calendarConnected={data.calendarConnected}
									googleEnabled={data.googleEnabled}
									disabled={!data.chatConfigured ||
										chat.status !== 'ready' ||
										data.thread?.pending ||
										pendingReplyMessageId !== null ||
										chat.messages.at(-1)?.id !== message.id}
									onReply={(answer) => void replyTo(message.id, answer)}
								/>
							{/if}
							{#each message.role === 'assistant' ? menusFor(message) : [] as menu}
								<MenuCard
									{menu}
									selectedIds={selectedDishes.map((dish) => dish.id)}
									disabled={chat.status !== 'ready' || !!data.thread?.pending}
									onSelect={(id) => toggleDish(menu, id)}
								/>
							{/each}
							{#each searches as search (search.key)}
								{@const places = search.places}
								<p class="px-3 text-xs text-primary-foreground/70">{search.area}</p>
								<div class="mx-3 w-full max-w-xl">
									<MapWidget
										{places}
										requestedCuisine={search.requestedCuisine}
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
								{#if chat.messages.at(-1)?.id !== message.id || followup?.calendarView}
									<p class="self-end text-xs text-primary-foreground/60">
										{inspection.venue} · {inspection.date} · {inspection.partySize} guests · Earlier availability
										check
									</p>
								{:else}
									<div class="w-full max-w-md self-end">
										<ReservationCalendar
											{inspection}
											googleEnabled={data.googleEnabled}
											calendarConnected={data.calendarConnected}
											disabled={!data.chatConfigured ||
												chat.status !== 'ready' ||
												data.thread?.pending ||
												chat.messages.at(-1)?.id !== message.id}
											selectedTime={selectedSlot?.date === inspection.date &&
											selectedSlot.venue === inspection.venue
												? selectedSlot.time
												: null}
											selectedExperience={selectedSlot?.experience ?? null}
											onSelectDate={(date) => {
												if (
													chat.status !== 'ready' ||
													data.thread?.pending ||
													pendingReplyMessageId ||
													chat.messages.at(-1)?.id !== message.id
												)
													return;
												selectedDate = date.length === 10 ? date : null;
												selectedSlot = null;
												void replyTo(
													message.id,
													date.length === 10
														? `Please check ${inspection.venue} for ${inspection.partySize} guests on ${date}.`
														: `I'd like ${inspection.venue} for ${inspection.partySize} guests in ${date}. Help me choose a day.`
												);
											}}
											onSelectTime={(time, experience) => {
												if (
													chat.status !== 'ready' ||
													data.thread?.pending ||
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
												messageField?.focus();
											}}
										/>
									</div>
								{/if}
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
						<p
							class="mx-auto max-w-2xl text-2xl leading-snug font-medium tracking-tight text-primary-foreground/90 sm:text-3xl"
						>
							{welcomePrompt}
						</p>
						<div class="scene-rail mx-auto flex w-full max-w-2xl snap-x gap-4 overflow-x-auto pb-2">
							{#each sceneCards as scene (scene.atmosphere)}
								<button
									type="button"
									class="scene-card w-[38%] max-w-44 flex-none snap-start text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground sm:w-[28%]"
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
									<span class="scene-caption mt-2 block text-sm font-medium text-primary-foreground"
										>{sceneTitles[scene.atmosphere]}</span
									>
									<span class="sr-only">{scene.detail}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
				{#if browserSessions.some((session) => session.open)}
					<BrowserPreviewStack sessions={browserSessions.filter((session) => session.open)} />
				{/if}
				{#if chat.status === 'submitted' || data.thread?.pending}
					<p class="text-sm text-primary-foreground/55" role="status">Thinking…</p>
				{/if}
				{#if chat.status === 'ready' && !data.thread?.pending && data.thread && chat.messages.at(-1)?.role === 'user'}
					<button
						type="button"
						class="self-start text-sm underline"
						onclick={() => void chat.regenerate()}>Continue response</button
					>
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
			<form
				onsubmit={send}
				class="shrink-0 rounded-[1.75rem] bg-secondary/80 p-3 shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_8px_24px_rgb(0_0_0/0.12)] focus-within:ring-1 focus-within:ring-primary-foreground/25"
			>
				{#if selectedPlace || selectedDate || selectedDishes.length}
					<div class="mb-3 flex flex-wrap items-center gap-2" aria-label="Selected context">
						{#each selectedDishes as dish (dish.id)}
							<button
								type="button"
								class="flex min-h-11 max-w-full items-center gap-2 rounded-2xl bg-secondary px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
								aria-label={`Remove ${dish.name} from selected dishes`}
								onclick={() =>
									(selectedDishes = selectedDishes.filter((item) => item.id !== dish.id))}
							>
								<span class="truncate">{dish.name}</span><span
									aria-hidden="true"
									class="text-primary-foreground/55">×</span
								>
							</button>
						{/each}
						{#if selectedPlace}
							<div
								class="inline-flex max-w-full min-w-0 items-center gap-2 rounded-xl bg-primary/50 pl-3 text-xs"
							>
								<span class="shrink-0 text-primary-foreground/50"
									><SFIcon icon="mappin" size="sm" /></span
								>
								<span class="truncate" title={selectedPlace.name}>{selectedPlace.name}</span>
								<button
									type="button"
									aria-label="Clear selected place"
									class="flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground/45 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
									onclick={() => {
										selectedPlace = null;
										selectedCuisine = null;
									}}><SFIcon icon="xmark" size="sm" /></button
								>
							</div>
							{#if selectedCuisine}
								<button
									type="button"
									class="min-h-11 rounded-xl px-3 text-xs text-primary-foreground/65 transition-colors hover:bg-primary-foreground/5 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-primary-foreground/10 aria-pressed:text-primary-foreground"
									aria-pressed={sessionCuisine === selectedCuisine}
									onclick={() =>
										(sessionCuisine = sessionCuisine === selectedCuisine ? null : selectedCuisine)}
									>More {selectedCuisine}{sessionCuisine === selectedCuisine ? ' ✓' : ''}</button
								>
							{/if}
						{/if}
						{#if selectedDate}
							<div
								class="inline-flex max-w-full min-w-0 items-center gap-2 rounded-xl bg-primary/50 pl-3 text-xs"
							>
								<span class="shrink-0 text-primary-foreground/50"
									><SFIcon icon="calendar" size="sm" /></span
								>
								<span class="min-w-0 py-2">
									<time datetime={selectedDate}
										>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric'
										})}</time
									>{#if selectedSlot}<span class="text-primary-foreground/55">
											·
										</span>{selectedSlot.time}<span
											class="block max-w-64 truncate text-primary-foreground/50"
											title={selectedSlot.venue}
											>{selectedSlot.venue}{selectedSlot.experience
												? ` · ${selectedSlot.experience}`
												: ''}</span
										>{/if}
								</span>
								<button
									type="button"
									aria-label="Clear selected date and time"
									class="flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground/45 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
									onclick={() => {
										selectedDate = null;
										selectedSlot = null;
									}}><SFIcon icon="xmark" size="sm" /></button
								>
							</div>
							{#if selectedSlot?.sourceUrl}
								<button
									type="button"
									class="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-medium hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
									disabled={chat.status !== 'ready' || data.thread?.pending}
									onclick={() =>
										void chat.sendMessage({
											text: 'Continue my selected time to checkout. Stop before entering guest or payment details or submitting.'
										})}>Continue to checkout <SFIcon icon="arrow-up-right" size="sm" /></button
								>
							{/if}
						{/if}
					</div>
				{/if}
				<div class="flex items-end gap-3">
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
						placeholder={activeFollowup ? 'Type your reply…' : 'What are you planning?'}
						class="min-h-12 flex-1 resize-none border-0 bg-transparent text-sm text-primary-foreground placeholder:text-primary-foreground/45 focus:ring-0"
						disabled={!data.chatConfigured}></textarea>
					<button
						type="submit"
						aria-label="Send message"
						class="flex size-11 shrink-0 items-center justify-center rounded-xl text-primary-foreground transition-colors hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground active:bg-primary-foreground/15 disabled:text-primary-foreground/35 disabled:hover:bg-transparent"
						disabled={!data.chatConfigured ||
							!input.trim() ||
							chat.status !== 'ready' ||
							data.thread?.pending}
					>
						<SFIcon icon="arrow-up" size="md" weight="semibold" />
					</button>
				</div>
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
