import { ElementType } from "@/data/enums/ElementType";
import {
	App,
	CachedMetadata,
	Editor,
	EditorPosition,
	MarkdownView,
	SectionCache,
	TFile,
	WorkspaceLeaf,
	parseYaml,
} from "obsidian";
import { RpgManagerInterface } from "src/RpgManagerInterface";
import { RelationshipType } from "src/data/enums/RelationshipType";
import { AttributeInterface } from "src/data/interfaces/AttributeInterface";
import { ElementInterface } from "src/data/interfaces/ElementInterface";
import { RelationshipInterface } from "src/data/interfaces/RelationshipInterface";
import { RelationshipFactory } from "src/factories/RelationshipFactory";
import { YamlService } from "../data/classes/YamlService";
import { EditorPositionService } from "./EditorPositionService";
import { TaskInterface } from "./taskService/interfaces/TaskInterface";

export class RpgManagerCodeblockService {
	private _fileContent: string | undefined = undefined;
	private _fileContentLines: string[] = undefined;
	private _metadata: CachedMetadata | null | undefined = undefined;
	private _codeblockContent: string | undefined = undefined;

	constructor(private _app: App, private _api: RpgManagerInterface, private _file: TFile) { }

	/**
	 * Reads the metadata for the file.
	 */
	private async _readMetadata(): Promise<void> {
		if (this._metadata !== undefined) return;

		this._fileContent = await this._app.vault.read(this._file);
		this._fileContentLines = this._fileContent.split("\n");
		this._metadata = this._app.metadataCache.getFileCache(this._file);
	}

	/**
	 * Returns the metadata if it exists, otherwise returns undefined.
	 *
	 * @return {CachedMetadata | undefined} The metadata or undefined.
	 */
	get metadata(): CachedMetadata | undefined {
		return this._metadata ?? undefined;
	}

	/**
	 * Modifies the content of the file and updates the editor position if the file is currently active.
	 * @param content - The new content of the file.
	 */
	private async _modifyFileContent(content: string): Promise<void> {
		let activeLeaf: WorkspaceLeaf | undefined;

		// Find the active leaf that corresponds to the current file
		for (const leaf of this._app.workspace.getLeavesOfType("markdown")) {
			if ((leaf.view as MarkdownView).file === this._file) {
				activeLeaf = leaf;
			}
		}

		// If there is an active leaf, update the editor position
		if (activeLeaf) {
			const markdownView: MarkdownView = activeLeaf.view as MarkdownView;
			const editor: Editor = markdownView.editor;
			const cursorPosition: EditorPosition = editor.getCursor();
			const scrollInfo: { top: number; left: number } = editor.getScrollInfo();
			EditorPositionService.setEditorPosition(this._file.path, editor, cursorPosition, scrollInfo);
		}

		// Modify the content of the file
		this._app.vault.modify(this._file, content);
	}

	/**
	 * Updates the codeblock with the given values.
	 * @param values - The values to update the codeblock with.
	 * @returns Promise<void>
	 */
	async update(values: any): Promise<void> {
		// Read the codeblock
		const codeblock = await this.readCodeblock();

		// If codeblock is undefined, return
		if (codeblock === undefined) return;

		// Initialize data, relationships, images, and tasks if they don't exist
		// Changed to codeblock.data = codeblock.data || {} 
		// instead of if (codeblock.data == undefined) codeblock.data = {} for simplicity
		codeblock.data = codeblock.data || {};
		codeblock.relationships = codeblock.relationships || [];
		codeblock.images = codeblock.images || [];
		codeblock.tasks = codeblock.tasks || [];

		// Update data if values.data is defined
		if (values.data !== undefined) {
			Object.keys(values.data).forEach((key: string) => {
				codeblock.data[key] = values.data[key];
			});
		}

		// Update relationships if values.relationships is defined
		if (values.relationships !== undefined) {
			values.relationships.forEach((relationship: RelationshipInterface) => {
				const existingRelationship: RelationshipInterface | undefined = codeblock.relationships.find(
					(existingRelationship: RelationshipInterface) => existingRelationship.path === relationship.path
				);
				if (existingRelationship === undefined) {
					codeblock.relationships.push({
						type: relationship.type,
						path: relationship.path,
					});
				} else {
					existingRelationship.type = relationship.type;
				}
			});
		}

		// Update images if values.images is defined
		if (values.images !== undefined) {
			values.images.forEach((image: any) => {
				const existingImage: any | undefined = codeblock.images.find(
					(existingImage: any) => existingImage.path === image.path
				);
				if (existingImage === undefined) {
					codeblock.images.push({
						path: image.path,
						caption: image.caption,
					});
				} else {
					existingImage.caption = image.caption;
				}
			});
		}

		// Update tasks if values.tasks is defined
		if (values.tasks !== undefined) {
			values.tasks.forEach((task: any) => {
				const existingTask: any | undefined = codeblock.tasks.find((existingTask: any) => existingTask.id === task.id);
				if (existingTask === undefined) {
					codeblock.tasks.push({
						id: task.id,
						priority: task.priority,
						name: task.name,
						description: task.description,
						complete: task.complete,
					});
				} else {
					existingTask.priority = task.priority;
					existingTask.name = task.name;
					existingTask.description = task.description;
					existingTask.complete = task.complete;
				}
			});
		}

		// Convert codeblock to YAML string
		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		// Modify and replace the file content
		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	/**
	 * Updates the relationships in the content.
	 * @param relationships - The relationships to update.
	 */
	async updateRelationshipInContent(relationships: RelationshipInterface[]): Promise<void> {
		// Read the metadata
		await this._readMetadata();

		// Check if metadata is null
		if (this._metadata === null) return undefined;

		// Get the element from the API
		const element = this._api.get(this._file.path) as ElementInterface;

		// If the element type is Campaign, return
		if (element.type === ElementType.Campaign) return;

		// Filter the relationships that are not in the content
		const relationshipsNotInContent = relationships.filter((relationship: RelationshipInterface) =>
			relationship.component !== undefined ||
			(relationship.isInContent === false && relationship.isAlsoInContent !== true)
		);

		// If no relationships need to be added, return
		if (relationshipsNotInContent.length === 0) return;

		// Create an array of relationships to add
		const relationshipsToAdd: string[] = relationshipsNotInContent.map((relationship: RelationshipInterface) => {
			if (relationship.component === undefined) return undefined;
			return "[[" + relationship.component.path + "|]]";
		});

		// Remove any undefined relationships from the array
		relationshipsToAdd.filter((relationship: string | undefined) => relationship !== undefined);

		// Join the relationships to add with a new line separator
		const toAdd: string = relationshipsToAdd.join("\n");

		// Get the relationships that have already been added to the content
		const relationshipsAddedToContent: string[] = this._fileContentLines.filter(
			(line: string) => line.startsWith("[[") && line.endsWith("|]]")
		);

		// Join the relationships to remove with a new line separator
		const toRemove: string = relationshipsAddedToContent.join("\n");

		// If the relationships to remove are the same as the relationships to add, return
		if (toRemove === toAdd) return;

		// Join the file content lines with a new line separator
		const fileContent = this._fileContentLines.join("\n");

		// If there are no relationships to remove, add the relationships to the content
		if (toRemove === "") {
			this._fileContentLines.push(...relationshipsToAdd);
			this._fileContent = this._fileContentLines.join("\n");
		} else {
			// Replace the relationships to remove with the relationships to add in the file content
			this._fileContent = this._fileContent.replace(toRemove, toAdd);
		}

		// If the file content has changed, modify the file content
		if (fileContent !== this._fileContent) this._modifyFileContent(this._fileContent);
	}

	/**
	 * Reads the codeblock content from the metadata and parses it as YAML.
	 * @returns The parsed YAML content or an empty object if the codeblock is not found or cannot be parsed.
	 */
	async readCodeblock(): Promise<any | undefined> {
		// Read the metadata
		await this._readMetadata();

		// If metadata is not available, return undefined
		if (this._metadata === null) return undefined;

		let codeblockContent: string | undefined = undefined;
		let codeblockData: SectionCache | undefined = undefined;

		// Loop through each section in the metadata
		for (let index = 0; index < (this._metadata?.sections?.length ?? 0); index++) {
			codeblockData = this._metadata?.sections !== undefined ? this._metadata.sections[index] : undefined;

			// Check if the current section is a codeblock section
			if (
				codeblockData !== undefined &&
				this._fileContentLines[codeblockData.position.start.line] === "```RpgManager4"
			) {
				codeblockContent = "";

				// Extract the codeblock content from the file content lines
				for (
					let lineIndex = codeblockData.position.start.line + 1;
					lineIndex < codeblockData.position.end.line;
					lineIndex++
				) {
					codeblockContent += this._fileContentLines[lineIndex] + "\n";
				}

				// If the codeblock content is not available, return undefined
				if (codeblockContent === undefined) return undefined;

				this._codeblockContent = codeblockContent;

				// Parse the codeblock content as YAML
				return (await parseYaml(codeblockContent)) ?? {};
			}
		}

		return undefined;
	}

	/** 
	 * Adds a code block to the RPG manager file.
	 * 
	 * @param rpgManagerCodeblock - The code block to add.
	 * @returns The modified file or undefined if the metadata is null.
	 */
	async addCodeBlock(rpgManagerCodeblock: any): Promise<TFile | undefined> {
		// Read the metadata
		await this._readMetadata();
		if (this._metadata === null) return undefined;

		// Create a new instance of the YamlService
		const yamlService: YamlService = new YamlService();

		// Convert the code block to a string
		const codeblockContent: string = yamlService.stringify(rpgManagerCodeblock);

		// Split the code block content into lines
		const codeblockContentLines: string[] = codeblockContent.split("\n");

		// Remove the last line (empty line)
		codeblockContentLines.pop();

		// Create an array to hold the new content
		let newContent: string[] = [];

		// Check if the frontmatter exists
		if (this._metadata.frontmatter === undefined) {
			// If frontmatter does not exist, add the code block to the top
			newContent = ["", "```RpgManager4", ...codeblockContentLines, "```", "", ...this._fileContentLines];
		} else {
			let frontmatterStarted = false;
			let frontmatterEnded = false;
			let codeblockAdded = false;

			// Iterate through each line of the file content
			this._fileContentLines.forEach((line: string) => {
				// Check if the line is the start or end of frontmatter
				if (line === "---") {
					if (frontmatterStarted) {
						frontmatterEnded = true;
					} else {
						frontmatterStarted = true;
					}
				}

				// Add the line to the new content array
				newContent.push(line);

				// Check if the frontmatter has started, ended, and the code block has not been added yet
				if (frontmatterStarted && frontmatterEnded && !codeblockAdded) {
					// Add the code block to the new content array
					newContent.push("", "```RpgManager4", ...codeblockContentLines, "```", "");
					codeblockAdded = true;
				}
			});
		}

		// Modify the file content with the new content
		this._modifyFileContent(newContent.join("\n"));

		// Return the modified file
		return this._file;
	}

	async updateImage(path: string, caption: string): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock === undefined || codeblock.images === undefined) return;

		const image = codeblock.images.find((image: any) => image.path === path);
		image.caption = caption;

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async deleteAttributes(): Promise<void> {
		const codeblock = await this.readCodeblock();

		if (codeblock.attributes !== undefined) {
			delete codeblock.attributes;

			const yamlService: YamlService = new YamlService();
			const codeblockContent: string = yamlService.stringify(codeblock);

			this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
		}
	}

	async addOrUpdateAttribute(attribute: AttributeInterface): Promise<void> {
		const codeblock = await this.readCodeblock();

		let existingAttribute: any = undefined;
		if (codeblock.attributes == undefined) {
			codeblock.attributes = [];
		} else {
			existingAttribute = codeblock.attributes.find((att: any) => att.id === attribute.id);
		}

		if (existingAttribute === undefined) {
			existingAttribute = attribute;
			codeblock.attributes.push(existingAttribute);
		} else {
			existingAttribute.customName = attribute.customName;
			existingAttribute.type = attribute.type;
			existingAttribute.customTypes = attribute.customTypes;
			if (attribute.options) existingAttribute.options = attribute.options;
		}

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async updateRelationship(relationship: RelationshipInterface): Promise<void> {
		const codeblock = await this.readCodeblock();

		let existingRelationship: any = undefined;
		if (codeblock.relationships == undefined) {
			codeblock.relationships = [];
		} else {
			existingRelationship = codeblock.relationships.find((rel: any) => rel.path === relationship.path);
		}

		if (existingRelationship === undefined) {
			existingRelationship = {
				type: relationship.type,
				path: relationship.path,
				description: relationship.description,
			};
			codeblock.relationships.push(existingRelationship);
		} else {
			existingRelationship.type = relationship.type;
			existingRelationship.description = relationship.description;
		}

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async updateCodeblockDataList(attributes: any[]): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock === undefined) return;

		if (codeblock.data == undefined) codeblock.data = {};

		attributes.forEach((attribute: { name: string; value?: string | boolean | number | [] | any }) => {
			if (attribute.value !== undefined) {
				codeblock.data[attribute.name] = attribute.value;
			} else {
				delete codeblock.data[attribute.name];
			}
		});

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	/**
	 * Update the sub-data of the codeblock with the given names and value.
	 * @param names - An array of names representing the path to the sub-data.
	 * @param value - The new value to be assigned to the sub-data.
	 */
	async updateCodeblockSubData(names: string[], value: any | undefined): Promise<void> {
		// Read the codeblock
		const codeblock = await this.readCodeblock();
		if (codeblock === undefined) return;

		// Initialize the data object if it doesn't exist
		if (codeblock.data == undefined) codeblock.data = {};

		// Traverse the sub-data object based on the names array
		let subData: any = codeblock.data;
		names.forEach((name: string, index: number) => {
			if (index === names.length - 1) {
				// Assign the value to the last name in the path,
				// or delete the sub-data if the value is undefined
				if (value !== undefined) {
					subData[name] = value;
				} else {
					delete subData[name];
				}
			} else {
				// Create a nested object if it doesn't exist
				if (subData[name] === undefined) subData[name] = {};
				subData = subData[name];
			}
		});

		// Convert the codeblock object to YAML string
		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		// Modify the file content by replacing the old codeblock content with the new one
		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async updateCodeblockData(name: string, value: any | undefined): Promise<void> {
		return this.updateCodeblockDataList([{ name, value }]);
	}

	async updateCodeblockId(name: string, value: any | undefined): Promise<void> {
		return this.updateCodeblockIdList([{ name, value }]);
	}

	async updateCodeblockIdList(ids: any[]): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock === undefined) return;

		ids.forEach((id: { name: string; value: string | boolean | number }) => {
			if (id.value !== undefined) {
				codeblock.id[id.name] = id.value;
			} else {
				delete codeblock.data[id.name];
			}
		});

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async updateRelationshipsPaths(toFile: TFile, oldPath: string): Promise<void> {
		await this.readCodeblock();

		if (this._codeblockContent.indexOf(oldPath) === -1) return;

		const oldBaseName = oldPath.split("/").pop().substring(0, oldPath.split("/").pop().lastIndexOf("."));

		let newCodeblockContent = this._codeblockContent.replaceAll(oldPath, toFile.path);
		if (oldBaseName !== toFile.basename && newCodeblockContent.indexOf("|" + oldBaseName) !== -1)
			newCodeblockContent = newCodeblockContent.replaceAll("|" + oldBaseName, "|" + toFile.basename);

		const content = this._fileContent.replace(this._codeblockContent, newCodeblockContent);

		//content = content.replaceAll("[[" + oldPath + "|]]", "[[" + toFile.path + "|]]");

		this._modifyFileContent(content);
	}

	async addImage(path: string, caption: string): Promise<void> {
		return this.addImages([{ path: path, caption: caption }]);
	}

	async addImages(images: { path: string; caption: string }[]): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock.images == undefined) codeblock.images = [];

		images.forEach((image: { path: string; caption: string }) => {
			codeblock.images.push(image);
		});

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async addRelationship(relationship: RelationshipInterface): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock.relationships == undefined) codeblock.relationships = [];

		const minimalRelationship: any = {
			type: relationship.type,
			path: relationship.path,
		};

		codeblock.relationships.push(minimalRelationship);

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async addOrUpdateTask(task: TaskInterface): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock.tasks == undefined) codeblock.tasks = [];

		const existingTaskIndex = codeblock.tasks.findIndex((existingTask: any) => existingTask.id === task.id);
		if (existingTaskIndex !== -1) {
			codeblock.tasks[existingTaskIndex] = task.prepare();
		} else {
			codeblock.tasks.push(task.prepare());
		}

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async deleteTask(task: TaskInterface): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock.tasks == undefined || codeblock.tasks.length === 0) return;

		const existingTaskIndex = codeblock.tasks.findIndex((existingTask: any) => existingTask.id === task.id);
		if (existingTaskIndex !== -1) {
			codeblock.tasks.splice(existingTaskIndex, 1);
		}

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async addRelationships(relationships: RelationshipInterface[]): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock.relationships == undefined) codeblock.relationships = [];

		relationships.forEach((relationship: RelationshipInterface) => {
			const foundRelationship: RelationshipInterface | undefined = codeblock.relationships.find(
				(foundRelationship: RelationshipInterface) => foundRelationship.path === relationship.path
			);
			if (foundRelationship !== undefined) return;

			const minimalRelationship: any = {
				type: relationship.type,
				path: relationship.path,
			};
			codeblock.relationships.push(minimalRelationship);
		});

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async removeRelationship(element: ElementInterface, relatedElement: ElementInterface): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock.relationships === undefined || codeblock.relationships.length === 0) return;

		codeblock.relationships = codeblock.relationships.filter(
			(minimalRelationship: any) => minimalRelationship.path !== relatedElement.file.path
		);

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		relatedElement.relationships = relatedElement.relationships.filter(
			(relationship: RelationshipInterface) => relationship.path !== element.file.path
		);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async removeImage(path: string): Promise<void> {
		const codeblock = await this.readCodeblock();
		if (codeblock === undefined || codeblock.images === undefined) return;

		codeblock.images = codeblock.images.filter((image: any) => image.path !== path);

		const yamlService: YamlService = new YamlService();
		const codeblockContent: string = yamlService.stringify(codeblock);

		this._modifyFileContent(this._fileContent.replace(this._codeblockContent, codeblockContent));
	}

	async readInContentRelationships(): Promise<RelationshipInterface[]> {
		await this.readCodeblock();

		const response: RelationshipInterface[] = [];

		const yamlService = new YamlService();
		const codeblockStringWithoutRelationships = parseYaml(this._codeblockContent);
		codeblockStringWithoutRelationships.relationships = [];
		const codeblockWithoutRelationships = yamlService.stringify(codeblockStringWithoutRelationships);
		response.push(...this._getRelationshipsFromContent(codeblockWithoutRelationships, true));

		const additionalRelationships = this._getRelationshipsFromContent(
			this._fileContent.replace(this._codeblockContent, ""),
			false
		);
		additionalRelationships.forEach((relationship: RelationshipInterface) => {
			const existingRelationship: RelationshipInterface | undefined = response.find(
				(existingRelationship: RelationshipInterface) => existingRelationship.path === relationship.path
			);
			if (existingRelationship === undefined) {
				response.push(relationship);
			} else {
				if (!existingRelationship.isAlsoInContent) existingRelationship.isAlsoInContent = true;
			}
		});

		return response;
	}

	/**
	 * Retrieves relationships from content.
	 * 
	 * @param content - The content to search for relationships.
	 * @param isInCodeblock - Indicates if the content is inside a code block.
	 * @returns An array of RelationshipInterface objects.
	 */
	private _getRelationshipsFromContent(content: string, isInCodeblock: boolean): RelationshipInterface[] {
		// Initialize an empty array to store the relationships
		const response: RelationshipInterface[] = [];

		// If the content is inside a code block
		if (isInCodeblock) {
			// Create a regular expression to match file paths inside double quotes
			const regex = /"([^"]+\.md)"/g;
			let match;

			// Iterate through all matches and create a RelationshipInterface object for each match
			while ((match = regex.exec(content)) !== null) {
				response.push(RelationshipFactory.createFromCodeblock(RelationshipType.Bidirectional, match[1]));
			}
		}

		// Find the index of the first occurrence of "[["
		let indexOfRelationship: number = content.indexOf("[[");

		// Iterate through all occurrences of "[[" and create a RelationshipInterface object for each occurrence
		while (indexOfRelationship !== -1) {
			// Remove the text before "[["
			content = content.substring(content.indexOf("[[") + 2);

			// Find the index of the closing "]]"
			const endLinkIndex = content.indexOf("]]");
			if (endLinkIndex === -1) break;

			// Extract the name and alias from the content
			const nameAndAlias = content.substring(0, endLinkIndex);

			// Find the index of the separator "|" in the name and alias
			const aliasIndex = nameAndAlias.indexOf("|");
			let basename: string | undefined = undefined;
			let skipHiddenLink = false;

			// If there is no separator "|"
			if (aliasIndex === -1) {
				basename = nameAndAlias;
			} else {
				// If the separator "|" is followed by another "|", skip the hidden link
				if (nameAndAlias.substring(aliasIndex) === "|") {
					skipHiddenLink = true;
				} else {
					basename = nameAndAlias.substring(0, aliasIndex);
				}
			}

			if (!skipHiddenLink && basename !== undefined) {
				// Find the matching file based on the basename or path
				const matchingFile: TFile | undefined = this._app.vault
					.getFiles()
					.find((file) => file.basename === basename || file.path === basename);

				// If a matching file is found and it is not already in the response array, create a RelationshipInterface object for it
				if (
					matchingFile !== undefined &&
					response.find((relationship: RelationshipInterface) => relationship.path === matchingFile.path) === undefined
				) {
					if (isInCodeblock) {
						response.push(RelationshipFactory.createFromCodeblock(RelationshipType.Bidirectional, matchingFile.path));
					} else {
						response.push(RelationshipFactory.createFromContent(RelationshipType.Bidirectional, matchingFile.path));
					}
				}
			}

			// Find the index of the next occurrence of "[["
			indexOfRelationship = content.indexOf("[[");
		}

		// Return the array of relationships
		return response;
	}
}
