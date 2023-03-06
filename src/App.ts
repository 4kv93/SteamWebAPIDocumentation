import type { PropType } from 'vue'
import type { ApiServiceGroups, ApiServices, ApiInterface, ApiMethod, ApiMethodParameter } from './interfaces';

import { defineComponent } from 'vue'
import Fuse from 'fuse.js'
import { getInterfaces } from './interfaces';

interface FuseSearchType {
	interface: string
	method: string
}

export default defineComponent({
	props: {
		interfaces: {
			type: Object as PropType<ApiServices>,
		}
	},
	data() {
		return {
			userData: {
				webapi_key: '',
				access_token: '',
				steamid: '',
				format: 'json',
				favorites: new Set<string>(),
			},
			keyInputType: 'password',
			hasValidWebApiKey: false,
			hasValidAccessToken: false,
			accessTokenVisible: false,
			currentFilter: '',
			currentInterface: '',
			interfaces: {},
			fuzzy: new Object as Fuse<FuseSearchType>,
		}
	},
	watch: {
		"userData.format"(value: string): void {
			localStorage.setItem('format', value);
		},
		"userData.webapi_key"(value: string): void {
			if (this.isFieldValid('webapi_key')) {
				localStorage.setItem('webapi_key', value);
			}
			else {
				localStorage.removeItem('webapi_key');
			}
		},
		"userData.access_token"(value: string): void {
			if (this.isFieldValid('access_token')) {
				localStorage.setItem('access_token', value);
			}
			else {
				localStorage.removeItem('access_token');
			}
		},
		"userData.steamid"(value: string): void {
			if (this.isFieldValid('steamid')) {
				localStorage.setItem('steamid', value);

				this.fillSteamidParameter();
			}
			else {
				localStorage.removeItem('steamid');
			}
		},
		currentInterface(newInterface: string): void {
			if (newInterface) {
				document.title = `${newInterface} – Steam Web API Documentation`;
			}
			else {
				document.title = `Steam Web API Documentation`;
			}

			if (document.scrollingElement) {
				document.scrollingElement.scrollTop = 0;
			}
		},
		currentFilter(newFilter: string, oldFilter: string): void {
			if (!newFilter) {
				this.$nextTick(this.scrollInterfaceIntoView);
			}
			else {
				this.currentInterface = '';

				if (!oldFilter) {
					document.querySelector('.sidebar')!.scrollTop = 0;
				}
			}
		}
	},
	mounted(): void {
		getInterfaces().then((interfaces) => {
			const flattenedMethods: FuseSearchType[] = [];

			try {
				this.userData.webapi_key = localStorage.getItem('webapi_key') || '';
				this.userData.access_token = localStorage.getItem('access_token') || '';
				this.userData.steamid = localStorage.getItem('steamid') || '';
				this.userData.format = localStorage.getItem('format') || 'json';

				const favoriteStrings = JSON.parse(localStorage.getItem('favorites') || '[]');

				for (const favorite of favoriteStrings) {
					const [favoriteInterface, favoriteMethod] = favorite.split('/', 2);

					if (Object.hasOwn(interfaces, favoriteInterface) &&
						Object.hasOwn(interfaces[favoriteInterface], favoriteMethod)) {
						interfaces[favoriteInterface][favoriteMethod].isFavorite = true;

						this.userData.favorites.add(favorite);
					}
				}
			}
			catch (e) {
				console.error(e);
			}

			for (const interfaceName in interfaces) {
				for (const methodName in interfaces[interfaceName]) {
					const method = interfaces[interfaceName][methodName];

					for (const parameter of method.parameters) {
						parameter._value = '';

						if (parameter.type === 'bool') {
							parameter.manuallyToggled = false;
						}
					}

					flattenedMethods.push({
						interface: interfaceName,
						method: methodName,
					} as FuseSearchType);
				}
			}

			this.interfaces = interfaces;

			this.setInterface();

			window.addEventListener('hashchange', () => {
				this.setInterface();
			}, false);

			const fuseOptions: Fuse.IFuseOptions<FuseSearchType> = {
				shouldSort: true,
				useExtendedSearch: true,
				threshold: 0.3,
				keys: [{
					name: 'interface',
					weight: 0.3
				}, {
					name: 'method',
					weight: 0.7
				}]
			};
			this.fuzzy = new Fuse<FuseSearchType>(flattenedMethods, fuseOptions);

			document.getElementById('loading')!.remove();
		});
	},
	computed: {
		sidebarInterfaces(): ApiServiceGroups {
			const interfaces = this.filteredInterfaces;
			const groups: ApiServiceGroups = {};

			if (this.currentFilter) {
				groups[""] = interfaces;
				return groups;
			}

			const defaultGroup = this.userData.favorites.size > 0 ? 'All interfaces' : '';
			groups[defaultGroup] = {} as ApiServices;
			groups["CSGO"] = {} as ApiServices;
			groups["Dota"] = {} as ApiServices;
			groups["Other Games"] = {} as ApiServices;

			for (const interfaceName in interfaces) {
				let group: string;

				if (interfaceName.endsWith("_730")) {
					group = "CSGO";
				}
				else if (interfaceName.endsWith("_570")) {
					group = "Dota";
				}
				else if (/_[0-9]+$/.test(interfaceName)) {
					group = "Other Games";
				} else {
					group = defaultGroup;
				}

				groups[group][interfaceName] = interfaces[interfaceName];
			}

			return groups;
		},
		filteredInterfaces(): ApiServices {
			if (!this.currentFilter) {
				return this.interfaces;
			}

			const matches = this.fuzzy.search(this.currentFilter.replace('/', '|'));
			const matchedInterfaces: ApiServices = {};

			for (const searchResult of matches) {
				const match = searchResult.item;

				if (!matchedInterfaces[match.interface]) {
					matchedInterfaces[match.interface] = {};
				}

				matchedInterfaces[match.interface][match.method] = this.interfaces[match.interface][match.method];
			}

			return matchedInterfaces;
		},
		currentInterfaceMethods(): ApiInterface {
			return this.interfaces[this.currentInterface];
		},
		uriDelimeterBeforeKey() {
			return this.hasValidAccessToken || this.hasValidWebApiKey ? '?' : '';
		},
	},
	methods: {
		setInterface(): void {
			let currentInterface = location.hash;
			let currentMethod = '';

			if (currentInterface[0] === '#') {
				const split = currentInterface.substring(1).split('/', 2);
				currentInterface = split[0];

				if (split[1]) {
					currentMethod = split[1];
				}
			}

			if (!this.interfaces.hasOwnProperty(currentInterface)) {
				currentInterface = '';
				currentMethod = '';
			}
			else if (!this.interfaces[currentInterface].hasOwnProperty(currentMethod)) {
				currentMethod = '';
			}

			const interfaceChanged = this.currentInterface !== currentInterface;

			this.currentInterface = currentInterface;

			if (interfaceChanged) {
				// Have to scroll manually because location.hash doesn't exist in DOM as target yet
				this.$nextTick(() => {
					const element = document.getElementById(`${currentInterface}/${currentMethod}`);

					if (element) {
						element.scrollIntoView({
							block: "start"
						});
					}
				});
			}
		},
		fillSteamidParameter(): void {
			if (!this.userData.steamid) {
				return;
			}

			for (const interfaceName in this.interfaces) {
				for (const methodName in this.interfaces[interfaceName]) {
					for (const parameter of this.interfaces[interfaceName][methodName].parameters) {
						if (!parameter._value && parameter.name.includes('steamid')) {
							parameter._value = this.userData.steamid;
						}
					}
				}
			}
		},
		isFieldValid(field: string): boolean {
			switch (field) {
				case 'access_token':
					this.hasValidAccessToken = /^[0-9a-f]{32}$/i.test(this.userData[field]);
					return this.hasValidAccessToken;

				case 'webapi_key':
					this.hasValidWebApiKey = /^[0-9a-f]{32}$/i.test(this.userData[field]);
					return this.hasValidWebApiKey;

				case 'steamid':
					return /^[0-9]{17}$/.test(this.userData[field]);
			}

			return false;
		},
		renderUri(methodName: string, method: ApiMethod): string {
			let host = 'https://api.steampowered.com/';

			if (method._type === 'publisher_only') {
				host = 'https://partner.steam-api.com/';
			}

			return `${host}${this.currentInterface}/${methodName}/v${method.version}/`;
		},
		renderApiKey(): string {
			const parameters = new URLSearchParams();

			if (this.hasValidAccessToken) {
				parameters.set('access_token', this.userData.access_token);
			}
			else if (this.hasValidWebApiKey) {
				parameters.set('key', this.userData.webapi_key);
			}

			return parameters.toString();
		},
		renderParameters(method: ApiMethod): string {
			const parameters = new URLSearchParams();

			if (this.userData.format !== 'json') {
				parameters.set('format', this.userData.format);
			}

			for (const parameter of method.parameters) {
				if (!parameter._value && !parameter.manuallyToggled) {
					continue;
				}

				parameters.set(parameter.name, parameter._value || '');
			}

			const str = parameters.toString();

			if (str.length === 0) {
				return '';
			}

			if (this.uriDelimeterBeforeKey) {
				return `&${str}`;
			}

			return `?${str}`;
		},
		useThisMethod(event: SubmitEvent, method: ApiMethod): void {
			if (method.httpmethod === 'POST' && !confirm(
				'Executing POST requests could be potentially disastrous.\n\n'
				+ 'Author is not responsible for any damage done.\n\n'
				+ 'Are you sure you want to continue?'
			)) {
				event.preventDefault();
			}

			for (const field of (event.target as HTMLFormElement).elements) {
				if (!(field instanceof HTMLInputElement)) {
					continue;
				}

				if (!field.value && !field.disabled && field.tagName === "INPUT") {
					field.disabled = true;

					setTimeout(() => field.disabled = false, 0);
				}
			}
		},
		addParamArray(method: ApiMethod, parameter: ApiMethodParameter): void {
			if (!parameter._counter) {
				parameter._counter = 1;
			}
			else {
				parameter._counter++;
			}

			const newParameter: ApiMethodParameter =
			{
				name: `${parameter.name.substring(0, parameter.name.length - 3)}[${parameter._counter}]`,
				optional: true,
			};

			const parameterIndex = method.parameters.findIndex(param => param.name === parameter.name);
			method.parameters.splice(parameterIndex + parameter._counter, 0, newParameter);
		},
		scrollInterfaceIntoView(): void {
			const element = document.querySelector(`.interface-list a[href="#${this.currentInterface}"]`);

			if (element instanceof HTMLElement) {
				element.scrollIntoView();
			}
		},
		copyUrl(event: MouseEvent): void {
			const element = (event.target as Element).closest('.input-group')!.querySelector('.form-control')!;
			const selection = window.getSelection()!;
			const range = document.createRange();
			range.selectNodeContents(element);
			selection.removeAllRanges();
			selection.addRange(range);
			document.execCommand('copy');
		},
		favoriteMethod(method: ApiMethod, methodName: string): void {
			const name = `${this.currentInterface}/${methodName}`;

			method.isFavorite = !method.isFavorite;

			if (method.isFavorite) {
				this.userData.favorites.add(name);
			} else {
				this.userData.favorites.delete(name);
			}

			localStorage.setItem('favorites', JSON.stringify([...this.userData.favorites]));
		},
		navigateSidebar(direction: number): void {
			const keys = Object.keys(this.filteredInterfaces);

			const size = keys.length;
			const index = keys.indexOf(this.currentInterface) + direction;

			this.currentInterface = keys[((index % size) + size) % size];
			this.scrollInterfaceIntoView();
		},
		focusApikey(): void {
			this.currentInterface = '';
			this.currentFilter = '';

			this.$nextTick(() => {
				const element = document.getElementById(this.hasValidAccessToken ? 'form-access-token' : 'form-api-key');

				if (element) {
					element.focus();
				}
			});
		}
	},
});
