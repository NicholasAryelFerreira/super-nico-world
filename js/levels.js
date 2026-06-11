/* Super Nico World — level definitions.
   ASCII tile maps, one character per 32px tile.
   Legend:
     #  ground (grass top + dirt)     X  solid stone block
     B  brick                         ?  question block (coin)
     M  question block (mushroom)     C  floating coin
     =  wooden platform               T  pipe top (auto 2-wide)
     |  pipe body                     F  flagpole
     g  goomba spawn                  k  koopa spawn
     S  player start                  ^  spikes
*/

const LEVELS = [
  {
    name: 'Green Hills',
    sky: ['#69b7e8', '#a8dcf5', '#e8f6dc'],
    rows: [
      '                                                                                                                        ',
      '                                                                                                                        ',
      '                                                                                                                        ',
      '                                                                                                            F           ',
      '                                                                                                            F           ',
      '                  ?                                  C C C                                                  F           ',
      '                                                                          B?B                               F           ',
      '                                          BM?B      ====== ',
      '            ?   B?B                                                                  C C                    F           ',
      '   S                         T            g                      T              ==========                  F           ',
      '                 g           |     g g    C  C       g   k       |    g                          g  g       F           ',
      '########################  #######################################################   ###############################     ',
      '########################  #######################################################   ###############################     ',
    ],
  },
  {
    name: 'Cavern Climb',
    sky: ['#2a3a5c', '#3d5a80', '#5b7ea3'],
    rows: [
      '                                                                                                                        ',
      '                                                                                                            F           ',
      '                                                                                                            F           ',
      '          C C                 BBBB                          C C C                                           F           ',
      '         =====                                             =====                  XXXX                      F           ',
      '                     ?                 ====                            ====                                 F           ',
      '                   =====      g                  M                            C                             F           ',
      '   S          C             ======      k      =====       g g               ===       g   k               F           ',
      '  ===        ===                                           =====                                  C C       F           ',
      '                      g                                                 g                        =====      F           ',
      '#########   ##############    ^^    ###############   ^^   ##################   ^^^   #############################     ',
      '#########   ##############    ^^    ###############   ^^   ##################   ^^^   #############################     ',
    ],
  },
  {
    name: 'Sunset Fortress',
    sky: ['#3b2a55', '#b6537a', '#f5a86e'],
    rows: [
      '                                                                                                                        ',
      '                                                                                                            F           ',
      '              C                                                                                             F           ',
      '            BBMBB                XX            C C C C               ?  ?                                   F           ',
      '                                XXXX          =========                                  XXXXX              F           ',
      '                       g       XXXXXX                          B?B            ====                          F           ',
      '        ?            =====    XXXXXXXX            k                                            C C          F           ',
      '   S          T               XXXXXXXXXX     g         g     T        g g            k        =====         F           ',
      '              |        C                                     |                                              F           ',
      '         g    |      =====        g            g  g          |   g                       g g                F           ',
      '####################################   ^^^^   #####################   ^^^^^   ####################################      ',
      '####################################   ^^^^   #####################   ^^^^^   ####################################      ',
    ],
  },
];
