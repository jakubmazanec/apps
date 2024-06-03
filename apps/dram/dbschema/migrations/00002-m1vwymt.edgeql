CREATE MIGRATION m1vwymtzlrezzduvnev7oeestqo745tul47t3ifw2nnlrccl3g5ayq
    ONTO m1hpbp6sp6lvpsqpmu4z3c5n5qd2xrjxuhy3wudq6kp7gzhmjrcjpq
{
  ALTER TYPE default::Note {
      ALTER PROPERTY noteId {
          RENAME TO order;
      };
  };
  ALTER TYPE default::Note {
      ALTER PROPERTY order {
          SET REQUIRED USING (<std::int64>{});
      };
  };
};
