import axios from "axios";
import * as cheerio from "cheerio";
import { WebSearchArgsSchema } from "../schemas.js";
import { logger } from "../logger.js";

async function extractRealUrl(ddgUrl: string): Promise<string | null> {
  try {
    if (!ddgUrl) return null;
    const urlParams = new URLSearchParams(ddgUrl.split('?')[1]);
    return decodeURIComponent(urlParams.get('uddg') || '');
  } catch {
    return null;
  }
}

function isValidResult(result: any): boolean {
  return (
    result.title?.length > 0 &&
    result.url?.length > 0 &&
    result.snippet?.length > 0
  );
}

async function scrapeResults(html: string) {
  const $ = cheerio.load(html);
  const results : any[] = [] ;
  
  // Extract web results
  $('.results_links_deep').each((i : number, element : any) => {
    const $result = $(element);
    const title = $result.find('.result__title .result__a');
    const snippet = $result.find('.result__snippet');
    const url = $result.find('.result__url');
    
    const redirectUrl = title.attr('href')!;
    const realUrl = extractRealUrl(redirectUrl);
    
    const result = {
      position: i + 1,
      title: title.text().trim(),
      snippet: snippet.text().trim(),
      url: realUrl,
      displayUrl: url.text().trim(),
      favicon: $result.find('.result__icon__img').attr('src')
    };
    
    if (isValidResult(result)) {
      results.push(result);
    }
  });

  // Extract featured result if present
  const featured = $('.zci-wrapper');
  let featuredResult = null;
  
  if (featured.length) {
    featuredResult = {
      title: featured.find('.zci__heading a').text().trim(),
      url: featured.find('.zci__heading a').attr('href'),
      description: featured.find('#zero_click_abstract').clone().children().remove().end().text().trim(),
      image: featured.find('.zci__image').attr('src')
    };
  }

  return {
    success: results.length > 0,
    featured: featuredResult,
    webResults: results,
    metadata: {
      totalResults: results.length,
      hasNextPage: $('.nav-link .btn--alt').length > 0,
      searchTime: new Date().toISOString()
    }
  };
}

export async function webSearch(args: unknown) {
  const parsed = WebSearchArgsSchema.safeParse(args);
  if (!parsed.success) {
    logger.error(`Invalid arguments for web_search: ${parsed.error}`);
    throw new Error(`Invalid arguments for web_search: ${parsed.error}`);
  }

  try {
    const query = encodeURIComponent(parsed.data.query);
    const url = `https://html.duckduckgo.com/html?q=${query}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const results = await scrapeResults(response.data);
    logger.info(`Successfully performed web search for query: ${parsed.data.query}`);
    
    return {
      content: [{ 
        type: "json", 
        data: results
      }]
    };

  } catch (error) {
    logger.error(`Error performing web search: ${error}`);
    throw new Error(`Error performing web search: ${error}`);
  }
}