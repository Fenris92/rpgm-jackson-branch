import {AbstractComponentFrontmatterTemplateFactory} from "../../abstracts/AbstractComponentFrontmatterTemplateFactory";
import {ControllerMetadataInterface} from "../../database/interfaces/metadata/ControllerMetadataInterface";
import {SessionMetadataInterface} from "../../database/interfaces/metadata/components/SessionMetadataInterface";
import {ActDataInterface} from "../../database/components/interfaces/data/ActDataInterface";

export class SessionFrontmatterTemplateFactory extends AbstractComponentFrontmatterTemplateFactory {
	public addFrontmatterData(
		frontmatter: any,
	): void {
		frontmatter.tags.push(this.settings.sessionTag + '/' + this.campaignId + '/' + this.sessionId);
	}

	public generateInitialCodeBlock(
	): string|undefined {
		const metadata: ControllerMetadataInterface|SessionMetadataInterface = {
			models: {
				header: true,
				lists: {
					scenes: {},
				}
			},
			data: {
				synopsis: '',
				image: '',
				complete: false,
				irl: undefined,
				abtStage: undefined
			}
		};
		return this.generateRpgManagerCodeBlock(
			metadata
		);
	}

	public generateLastCodeBlock(
	): string|undefined {
		const metadata: ControllerMetadataInterface|ActDataInterface = {
			models: {
				lists: {
					subplots: {},
					musics: {},
					pcs: {},
					npcs: {},
					factions: {},
					clues: {},
					locations: {},
					events: {},
				}
			}
		}
		return this.generateRpgManagerCodeBlock(
			metadata
		);
	}
}
