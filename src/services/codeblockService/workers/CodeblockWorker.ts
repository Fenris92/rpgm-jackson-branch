import {CodeblockWorkerInterface} from "../interfaces/CodeblockWorkerInterface";
import {CodeblockDomainInterface} from "../interfaces/CodeblockDomainInterface";
import {CachedMetadata, Editor, EditorPosition, MarkdownView, parseYaml, SectionCache, TFile} from "obsidian";
import {RpgManagerApiInterface} from "../../../api/interfaces/RpgManagerApiInterface";
import {YamlService} from "../../yamlService/YamlService";

export class CodeblockWorker implements CodeblockWorkerInterface {
	constructor(
		private _api: RpgManagerApiInterface,
	) {
	}

	public async updateContent(
		domain: CodeblockDomainInterface,
	): Promise<boolean> {
		if (domain.editor !== undefined){
			await domain.editor.replaceRange(this._api.service(YamlService).stringify(domain.codeblock), domain.codeblockStart, domain.codeblockEnd);
			this._api.app.vault.modify(domain.file, domain.editor.getValue())
				.then(() => {
					this._api.database.readByPath(domain.file.path)?.touch();
					this._api.app.workspace.trigger("rpgmanager:refresh-staticViews");
				});
			return true;
		} else {
			//TODO: Add this part
			return true;
		}
	}

	public async readContent(
		file?: TFile,
		codeblockName = 'RpgManagerData',
	): Promise<CodeblockDomainInterface|undefined> {
		let editor: Editor|undefined = undefined;
		let cache: CachedMetadata|null = null;
		let codeblock: any;
		let codeblockContent: string|undefined = undefined;
		let codeblockStart: EditorPosition|undefined = undefined;
		let codeblockEnd: EditorPosition|undefined = undefined;

		if (file === undefined){
			const activeView: MarkdownView|null = await app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView == undefined)
				return undefined;

			editor = await activeView.editor;
			const file: TFile = await activeView.file;
			cache = await this._api.app.metadataCache.getFileCache(file);

			if (cache == undefined)
				return undefined;

			let codeblockData: SectionCache|undefined = undefined;
			for (let index=0; index<(cache?.sections?.length ?? 0); index++){
				codeblockData = await (cache?.sections !== undefined ? cache.sections[index] : undefined);
				if (codeblockData !== undefined && editor.getLine(codeblockData.position.start.line) === '```' + codeblockName){
					codeblockStart = {line: codeblockData.position.start.line + 1, ch: 0};
					codeblockEnd = {line: codeblockData.position.end.line, ch: 0};
					codeblockContent = await editor.getRange(codeblockStart, codeblockEnd);
					codeblock = await parseYaml(codeblockContent) ?? {};

					break;
				}
			}
		} else {
			const fileContent: string = await this._api.app.vault.read(file);
			const fileContentLines = fileContent.split('\n');
			cache = await this._api.app.metadataCache.getFileCache(file);

			if (cache == undefined)
				return undefined;

			let codeblockData: SectionCache|undefined = undefined;
			for (let index=0; index<(cache?.sections?.length ?? 0); index++) {
				codeblockData = await (cache?.sections !== undefined ? cache.sections[index] : undefined);
				if (codeblockData !== undefined && fileContentLines[codeblockData.position.start.line] === '```' + codeblockName){
					codeblockStart = {line: codeblockData.position.start.line + 1, ch: 0};
					codeblockEnd = {line: codeblockData.position.end.line, ch: 0};

					codeblockContent = '';
					for (let lineIndex=codeblockData.position.start.line+1; lineIndex<codeblockData.position.end.line; lineIndex++){
						codeblockContent += fileContentLines[lineIndex] + '\n';
					}

					if (codeblockContent === undefined)
						return undefined;

					codeblock = await parseYaml(codeblockContent) ?? {};
					break;
				}
			}
		}

		if (cache == undefined || file === undefined || codeblockContent === undefined || codeblockStart === undefined || codeblockEnd === undefined)
			return undefined;

		const response: CodeblockDomainInterface = {
			editor: editor,
			file: file,
			cache: cache,
			codeblock: codeblock,
			codeblockStart: codeblockStart,
			codeblockEnd: codeblockEnd,
			codeblockContent: codeblockContent,
		};

		return response;
	}
}
