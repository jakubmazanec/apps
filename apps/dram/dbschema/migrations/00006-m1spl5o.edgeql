CREATE MIGRATION m1spl5okaliwfwwvypq7uwcr2whanv5v4nekslsclimq4mflsjgzya
    ONTO m1qsiy7ls4pmcpkv6zdo3v2b4sqn6savvpliryltzve3evm6kz5rqa
{
  ALTER TYPE default::Note {
      CREATE PROPERTY searchableStrength := ((std::to_str((.strength * 100)) ++ ' %'));
  };
  ALTER TYPE default::Note {
      CREATE INDEX ext::pg_trgm::gin ON (.searchableStrength);
  };
  ALTER TYPE default::Note {
      DROP INDEX ext::pg_trgm::gin ON (std::to_str(.strength));
      CREATE PROPERTY searchableAge := (std::to_str(.age));
  };
  ALTER TYPE default::Note {
      CREATE INDEX ext::pg_trgm::gin ON (.searchableAge);
  };
  ALTER TYPE default::Note {
      DROP INDEX ext::pg_trgm::gin ON (std::to_str(.age));
  };
};
