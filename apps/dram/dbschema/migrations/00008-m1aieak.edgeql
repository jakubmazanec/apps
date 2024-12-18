CREATE MIGRATION m1aieakshwm2k6qio7zjcekobgptq6vjo6zcvhrpg2m35y6qqjkika
    ONTO m1bgk2yufm6qxfy5j7qvxl3hney7o7yoi34gsa5oo3yh34hukpwzgq
{
  ALTER TYPE default::Note {
      DROP INDEX ext::pg_trgm::gin ON (.searchableStrength);
  };
  ALTER TYPE default::Note {
      CREATE INDEX ext::pg_trgm::gin ON (std::to_str((.strength * 100)));
  };
  ALTER TYPE default::Note {
      DROP INDEX ext::pg_trgm::gin ON (.searchableAge);
      DROP PROPERTY searchableAge;
      DROP PROPERTY searchableStrength;
  };
};
