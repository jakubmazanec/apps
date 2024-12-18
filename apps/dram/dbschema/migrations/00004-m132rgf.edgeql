CREATE MIGRATION m132rgfdvb3wlrn6vojwhx6vzsop46gvc3oletiz7g4shlxajo4wqq
    ONTO m1aasuvju7ozvjcz4q2swc24x7p35l6ksvposfti2pk7ipgueupm3a
{
  CREATE EXTENSION pg_trgm VERSION '1.6';
  ALTER TYPE default::Note {
      CREATE INDEX ext::pg_trgm::gin ON (.bottler);
      CREATE INDEX ext::pg_trgm::gin ON (.edition);
      CREATE INDEX ext::pg_trgm::gin ON (.caskNumber);
      CREATE INDEX ext::pg_trgm::gin ON (.batch);
      CREATE INDEX ext::pg_trgm::gin ON (.name);
      CREATE INDEX ext::pg_trgm::gin ON (.vintage);
      CREATE INDEX ext::pg_trgm::gin ON (.bottled);
      CREATE INDEX ext::pg_trgm::gin ON (.distillery);
      CREATE INDEX ext::pg_trgm::gin ON (.caskType);
      CREATE INDEX ext::pg_trgm::gin ON (.brand);
  };
};
