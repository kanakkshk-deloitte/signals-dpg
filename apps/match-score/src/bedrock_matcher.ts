import {
    BedrockRuntimeClient,
    ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import z, {
    MatchScoreRequestSchema,
    MatchScoreResponseSchema,
} from '@dpg/schemas';
import type { MatchScoreRequest, MatchScoreResult } from '@dpg/match_score';

export type BedrockMatcherConfig = {
    region: string;
    baseUrl?: string;
    apiKey?: string;
    modelId: string;
    version: string;
    promptVersion: string;
    temperature: number;
    topP: number;
    maxTokens: number;
};

const BedrockModelResponseSchema = z.object({
    score: z.number().finite().min(0).max(1),
    confidence: z.number().finite().min(0).max(1).optional(),
    reasoning: z.string().min(1),
    signals: z
        .array(
            z.object({
                name: z.string().min(1),
                impact: z.enum(['positive', 'negative', 'neutral']),
                summary: z.string().min(1),
            })
        )
        .max(6)
        .optional(),
});

function toBand(score: number): string {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
}

function extractTextContent(content: unknown): string {
    if (!Array.isArray(content)) {
        return '';
    }

    for (const block of content) {
        if (
            block &&
            typeof block === 'object' &&
            'text' in block &&
            typeof (block as { text?: unknown }).text === 'string'
        ) {
            return (block as { text: string }).text;
        }
    }

    return '';
}

function extractJsonPayload(text: string): string {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');

    if (first === -1 || last === -1 || last <= first) {
        throw new Error('Bedrock response did not contain JSON');
    }

    return text.slice(first, last + 1);
}

function extractFromResponseShape(raw: unknown): z.infer<typeof BedrockModelResponseSchema> {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Model response is empty');
    }

    const record = raw as Record<string, unknown>;

    if ('score' in record) {
        return BedrockModelResponseSchema.parse(record);
    }

    const outputMessage = (record.output as Record<string, unknown> | undefined)
        ?.message as Record<string, unknown> | undefined;
    const text = extractTextContent(outputMessage?.content);
    if (text) {
        return BedrockModelResponseSchema.parse(JSON.parse(extractJsonPayload(text)));
    }

    const choices = record.choices;
    if (Array.isArray(choices) && choices.length > 0) {
        const first = choices[0] as Record<string, unknown>;
        const message = first.message as Record<string, unknown> | undefined;
        const contentText = typeof message?.content === 'string' ? message.content : '';

        if (contentText) {
            return BedrockModelResponseSchema.parse(
                JSON.parse(extractJsonPayload(contentText))
            );
        }
    }

    throw new Error('Unsupported model response shape');
}

export class BedrockMatchScorer {
    private readonly client: BedrockRuntimeClient;

    constructor(private readonly config: BedrockMatcherConfig) {
        this.client = new BedrockRuntimeClient({
            region: config.region,
            ...(config.baseUrl ? { endpoint: config.baseUrl } : {}),
        });
    }

    private async scoreViaApiKey(prompt: string): Promise<{
        parsed: z.infer<typeof BedrockModelResponseSchema>;
        raw: unknown;
    } | null> {
        if (!this.config.apiKey || !this.config.baseUrl) {
            return null;
        }

        const base = this.config.baseUrl.replace(/\/$/, '');
        const modelIdPath = encodeURIComponent(this.config.modelId).replace(/%3A/g, ':');
        const url = `${base}/model/${modelIdPath}/converse`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
                'x-api-key': this.config.apiKey,
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        content: [{ text: prompt }],
                    },
                ],
                system: [{ text: 'You are a strict JSON API. Never output markdown.' }],
                inferenceConfig: {
                    maxTokens: this.config.maxTokens,
                    temperature: this.config.temperature,
                    topP: this.config.topP,
                },
            }),
        });

        const rawText = await response.text();
        if (!response.ok) {
            throw new Error(
                `Bedrock API-key mode failed ${response.status}: ${rawText || response.statusText}`
            );
        }

        const raw = rawText ? (JSON.parse(rawText) as unknown) : null;
        return {
            parsed: extractFromResponseShape(raw),
            raw,
        };
    }

    async score(requestBody: unknown): Promise<MatchScoreResult> {
        const input = MatchScoreRequestSchema.parse(requestBody);

        const prompt = [
            'You compute match score between two profiles.',
            'Return ONLY JSON object with keys: score, confidence, reasoning, signals.',
            'Rules:',
            '- Use only the provided request fields as source data.',
            '- Do not invent missing attributes or synthetic signals.',
            '- score: number between 0 and 1.',
            '- confidence: number between 0 and 1.',
            '- reasoning: concise sentence.',
            '- signals: up to 4 entries with name, impact (positive|negative|neutral), summary.',
            '',
            JSON.stringify(input as MatchScoreRequest),
        ].join('\n');

        const apiKeyResult = await this.scoreViaApiKey(prompt);

        let parsedModelOutput: z.infer<typeof BedrockModelResponseSchema>;
        let rawResponse: unknown;

        if (apiKeyResult) {
            parsedModelOutput = apiKeyResult.parsed;
            rawResponse = apiKeyResult.raw;
        } else {
            const command = new ConverseCommand({
                modelId: this.config.modelId,
                system: [{ text: 'You are a strict JSON API. Never output markdown.' }],
                messages: [
                    {
                        role: 'user',
                        content: [{ text: prompt }],
                    },
                ],
                inferenceConfig: {
                    maxTokens: this.config.maxTokens,
                    temperature: this.config.temperature,
                    topP: this.config.topP,
                },
            });

            const response = await this.client.send(command);
            rawResponse = response;
            const rawText = extractTextContent(response.output?.message?.content);
            parsedModelOutput = BedrockModelResponseSchema.parse(
                JSON.parse(extractJsonPayload(rawText))
            );
        }

        const result: MatchScoreResult = {
            provider: 'dpg_scoring',
            score: parsedModelOutput.score,
            band: toBand(parsedModelOutput.score),
            confidence: parsedModelOutput.confidence,
            version: this.config.version,
            prompt_version: this.config.promptVersion,
            model_provider: 'amazon_bedrock',
            model: this.config.modelId,
            reasoning: parsedModelOutput.reasoning,
            signals: parsedModelOutput.signals,
            raw_response: {
                bedrock: rawResponse,
                parsed: parsedModelOutput,
            },
        };

        return MatchScoreResponseSchema.parse(result);
    }
}
