import { MCPConfigs } from '../common';
import { Logger } from './logger.helper';

export interface IGithubError {
  error: string;
  status: number;
}

export interface IGithubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number;
  url: string;
}

export interface IGithubContent {
  content: string;
}

interface IGithubApiResponse {
  message?: string;
  [key: string]: any;
}

// --------------------------------------------------------------------------------------------------
// Helper function to create a standardized error response
const getError = (opts: { message: string; status?: number }): IGithubError => ({
  error: opts.message,
  status: opts.status || 500,
});

// --------------------------------------------------------------------------------------------------
/**
 * A helper class for interacting with the VENIZIA-AI/ignis GitHub repository.
 */
export class GithubHelper {
  private static getApiUrl(opts: { path: string }): string {
    const { apiBase, repoOwner, repoName } = MCPConfigs.github;
    return [apiBase, MCPConfigs.github.repoPath, repoOwner, repoName, opts.path].join('/');
  }

  /**
   * Fetches the contents of a directory from the GitHub repository.
   * @param opts.path - The path to the directory from the repository root.
   * @returns A promise that resolves to the directory content or an error object.
   */
  static async getDirectoryContents(
    opts: { path?: string } = {},
  ): Promise<IGithubFile[] | IGithubError> {
    const dirPath = opts.path ?? '';
    const { branch, userAgent } = MCPConfigs.github;
    const url = this.getApiUrl({ path: `contents/${dirPath}?ref=${branch}` });
    Logger.debug(`Fetching directory from GitHub: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        Logger.error(`GitHub API error for path "${dirPath}": ${response.statusText}`);
        return getError({ message: response.statusText, status: response.status });
      }

      const data = (await response.json()) as IGithubApiResponse | IGithubApiResponse[];

      if (!Array.isArray(data)) {
        if (data.message) {
          Logger.error(`GitHub API error for path "${dirPath}": ${data.message}`);
          return getError({ message: data.message, status: 404 });
        }

        return getError({ message: 'Invalid response from GitHub API', status: 500 });
      }

      return data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type, // 'file' or 'dir'
        size: item.size,
        url: item.html_url,
      }));
    } catch (error) {
      Logger.error(`Failed to fetch directory "${dirPath}" from GitHub:`, error);
      return getError({
        message: `Failed to fetch directory content. ${error instanceof Error ? error.message : ''}`,
        status: 500,
      });
    }
  }

  /**
   * Fetches the content of a specific file from the GitHub repository.
   * @param opts.filePath - The path to the file from the repository root.
   * @returns A promise that resolves to the file content or an error object.
   */
  static async getFileContent(opts: { filePath: string }): Promise<IGithubContent | IGithubError> {
    const { rawContentBase, repoOwner, repoName, branch } = MCPConfigs.github;
    // We use the raw content URL for files to avoid API rate limits and base64 decoding.
    const url = [rawContentBase, repoOwner, repoName, branch, opts.filePath].join('/');
    Logger.debug(`Fetching file content from GitHub: ${url}`);

    try {
      const response = await fetch(url);
      const content = await response.text();

      // Check if the fetch was successful. GitHub returns a "404: Not Found" string for missing files
      // when using raw.githubusercontent.com, OR returns 404 status.
      if (response.status === 404 || (typeof content === 'string' && content.startsWith('404'))) {
        Logger.warn(`File not found on GitHub: ${opts.filePath}`);
        return getError({ message: 'File not found', status: 404 });
      }

      if (!response.ok) {
        return getError({ message: response.statusText, status: response.status });
      }

      return { content };
    } catch (error) {
      Logger.error(`Failed to fetch file "${opts.filePath}" from GitHub:`, error);
      return getError({
        message: `Failed to fetch file content. ${error instanceof Error ? error.message : ''}`,
        status: 500,
      });
    }
  }
}
