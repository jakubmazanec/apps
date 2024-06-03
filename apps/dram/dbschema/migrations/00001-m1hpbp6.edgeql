CREATE MIGRATION m1hpbp6sp6lvpsqpmu4z3c5n5qd2xrjxuhy3wudq6kp7gzhmjrcjpq
    ONTO initial
{
  CREATE TYPE default::Note {
      CREATE PROPERTY age: std::int64;
      CREATE PROPERTY balanceRating: std::float64;
      CREATE PROPERTY barCode: std::str;
      CREATE PROPERTY batch: std::str;
      CREATE PROPERTY bottleCode: std::str;
      CREATE PROPERTY bottleId: std::str;
      CREATE PROPERTY bottleNumber: std::int64;
      CREATE PROPERTY bottled: std::str;
      CREATE PROPERTY bottler: std::str;
      CREATE PROPERTY bottlesCount: std::int64;
      CREATE PROPERTY boughtAt: std::str;
      CREATE PROPERTY brand: std::str;
      CREATE PROPERTY caskNnumber: std::str;
      CREATE PROPERTY caskType: std::str;
      CREATE PROPERTY color: std::str;
      CREATE PROPERTY distillery: std::str;
      CREATE PROPERTY edition: std::str;
      CREATE PROPERTY finish: std::str;
      CREATE PROPERTY finishRating: std::float64;
      CREATE PROPERTY name: std::str;
      CREATE PROPERTY nose: std::str;
      CREATE PROPERTY noseRating: std::float64;
      CREATE PROPERTY noteId: std::int64;
      CREATE PROPERTY rating: std::float64;
      CREATE PROPERTY score: std::float64;
      CREATE PROPERTY size: std::float64;
      CREATE PROPERTY strength: std::float64;
      CREATE PROPERTY taste: std::str;
      CREATE PROPERTY tasteRating: std::float64;
      CREATE PROPERTY tastedAt: std::datetime;
      CREATE PROPERTY tastingLocation: std::str;
      CREATE PROPERTY vintage: std::str;
      CREATE PROPERTY whiskyId: std::str;
      CREATE PROPERTY whiskybaseUrl: std::str;
  };
};
