CREATE MIGRATION m14scsosujzzb5rp65xz426sggfmxb3ajzmpw7w7tl2ermy44xgwqq
    ONTO m1qq3mcivhva5zynn4b2oxpukugffpo43xrejoskgsj6wonchhllra
{
  ALTER SCALAR TYPE default::UserRole EXTENDING enum<User, Guest, Member, Admin>;
};
