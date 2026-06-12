import { Injectable } from '@nestjs/common';
import { MedCoverPageType, PageEntities } from './page-type.util';

export interface SchemaBuildInput {
  pageType: MedCoverPageType;
  title: string;
  canonical: string;
  entities?: PageEntities;
  faq?: Array<{ question: string; answer: string }>;
  clinicUrls?: string[];
  rating?: { value: number; count: number };
}

@Injectable()
export class SeoSchemaBuilderService {
  build(input: SchemaBuildInput): object[] {
    const graph: object[] = [];
    const siteUrl = input.canonical.replace(/\/[^/]*\/?$/, '');

    graph.push(this.breadcrumbList(input.canonical, input.title, input.pageType, input.entities));

    if (input.faq?.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: input.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      });
    }

    graph.push({
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', '[data-speakable="true"]', '.answer-block'],
    });

    switch (input.pageType) {
      case 'clinics_hub':
      case 'treatments_hub':
      case 'cost_hub':
      case 'compare_hub':
      case 'guides_hub':
      case 'countries_hub':
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: input.title,
          url: input.canonical,
        });
        break;

      case 'clinic_country_plp':
      case 'clinic_city_plp':
      case 'clinic_country_treatment_plp':
      case 'clinic_city_treatment_plp':
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: input.title,
          url: input.canonical,
          mainEntity: {
            '@type': 'ItemList',
            itemListElement: (input.clinicUrls ?? []).map((url, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url,
            })),
          },
        });
        break;

      case 'clinic_pdp':
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'MedicalClinic',
          name: input.title,
          url: input.canonical,
          ...(input.rating
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: input.rating.value,
                  bestRating: 5,
                  worstRating: 1,
                  ratingCount: input.rating.count,
                },
              }
            : {}),
        });
        break;

      case 'treatment_detail':
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'MedicalProcedure',
          name: input.title,
          url: input.canonical,
        });
        break;

      case 'cost_treatment':
      case 'cost_country':
      case 'cost_city':
      case 'country_landing':
      case 'guide':
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'MedicalWebPage',
          name: input.title,
          url: input.canonical,
        });
        break;

      case 'compare_clinic':
      case 'compare_city':
      case 'compare_country':
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: input.title,
          url: input.canonical,
        });
        break;

      case 'home':
        graph.unshift(
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'MedCover',
            url: siteUrl,
            potentialAction: {
              '@type': 'SearchAction',
              target: `${siteUrl}/search?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@type': 'Organization',
            name: 'MedCover',
            url: siteUrl,
          },
        );
        break;

      default:
        graph.unshift({
          '@context': 'https://schema.org',
          '@type': 'MedicalWebPage',
          name: input.title,
          url: input.canonical,
        });
    }

    return graph;
  }

  private breadcrumbList(
    canonical: string,
    title: string,
    pageType: MedCoverPageType,
    entities?: PageEntities,
  ): object {
    const base = canonical.replace(/\/[^/]*\/?$/, '');
    const items: Array<{ name: string; item: string }> = [{ name: 'Home', item: `${base}/` }];

    if (pageType.startsWith('clinic_') && entities?.country) {
      items.push({ name: entities.country.name, item: `${base}/clinics/${entities.country.slug}/` });
    }
    if (entities?.city) {
      items.push({
        name: entities.city.name,
        item: `${base}/clinics/${entities.country?.slug}/${entities.city.slug}/`,
      });
    }
    items.push({ name: title, item: canonical });

    return {
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        item: item.item,
      })),
    };
  }
}
