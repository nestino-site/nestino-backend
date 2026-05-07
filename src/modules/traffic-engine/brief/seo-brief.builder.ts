import { Injectable } from '@nestjs/common';
import { Keyword, Page, Site } from '@prisma/client';

export interface SeoBrief {
  siteName: string;
  domain: string;
  language: string;
  keyword: string;
}

@Injectable()
export class SeoBriefBuilder {
  build(site: Site, keyword: Keyword, _page: Page): SeoBrief {
    return {
      siteName: site.name,
      domain: site.domain,
      language: keyword.language,
      keyword: keyword.keyword,
    };
  }
}
